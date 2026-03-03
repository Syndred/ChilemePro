-- ============================================
-- Social atomic RPCs
-- ============================================
-- Keep likes/comments counters consistent in a single transaction.

CREATE OR REPLACE FUNCTION public.social_like_post_atomic(p_post_id UUID)
RETURNS TABLE (
  is_liked BOOLEAN,
  likes_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_user_id UUID;
  v_post_owner_id UUID;
  v_inserted_count INTEGER := 0;
  v_likes_count INTEGER := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'UNAUTHORIZED';
  END IF;

  SELECT sp.user_id
  INTO v_post_owner_id
  FROM social_posts sp
  WHERE sp.id = p_post_id
    AND (sp.status = 'published' OR sp.user_id = v_user_id)
  LIMIT 1;

  IF v_post_owner_id IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0002', message = 'POST_NOT_FOUND';
  END IF;

  IF v_post_owner_id <> v_user_id
    AND NOT EXISTS (
      SELECT 1
      FROM user_follows uf
      WHERE uf.follower_id = v_user_id
        AND uf.following_id = v_post_owner_id
    )
  THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'FORBIDDEN';
  END IF;

  INSERT INTO post_likes (post_id, user_id)
  VALUES (p_post_id, v_user_id)
  ON CONFLICT (post_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  IF v_inserted_count > 0 THEN
    UPDATE social_posts sp
    SET likes_count = COALESCE(sp.likes_count, 0) + 1,
        updated_at = NOW()
    WHERE sp.id = p_post_id;
  END IF;

  SELECT COALESCE(sp.likes_count, 0)
  INTO v_likes_count
  FROM social_posts sp
  WHERE sp.id = p_post_id;

  RETURN QUERY SELECT TRUE, v_likes_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.social_unlike_post_atomic(p_post_id UUID)
RETURNS TABLE (
  is_liked BOOLEAN,
  likes_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_user_id UUID;
  v_deleted_count INTEGER := 0;
  v_likes_count INTEGER := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'UNAUTHORIZED';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM social_posts sp WHERE sp.id = p_post_id) THEN
    RAISE EXCEPTION USING errcode = 'P0002', message = 'POST_NOT_FOUND';
  END IF;

  DELETE FROM post_likes pl
  WHERE pl.post_id = p_post_id
    AND pl.user_id = v_user_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  IF v_deleted_count > 0 THEN
    UPDATE social_posts sp
    SET likes_count = GREATEST(COALESCE(sp.likes_count, 0) - 1, 0),
        updated_at = NOW()
    WHERE sp.id = p_post_id;
  END IF;

  SELECT COALESCE(sp.likes_count, 0)
  INTO v_likes_count
  FROM social_posts sp
  WHERE sp.id = p_post_id;

  RETURN QUERY SELECT FALSE, v_likes_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.social_add_comment_atomic(
  p_post_id UUID,
  p_content TEXT
)
RETURNS TABLE (
  comment_id UUID,
  post_id UUID,
  user_id UUID,
  content TEXT,
  created_at TIMESTAMP,
  comments_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_user_id UUID;
  v_post_owner_id UUID;
  v_content TEXT;
  v_comment_id UUID;
  v_created_at TIMESTAMP;
  v_comments_count INTEGER := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'UNAUTHORIZED';
  END IF;

  v_content := BTRIM(COALESCE(p_content, ''));
  IF CHAR_LENGTH(v_content) = 0 THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'EMPTY_COMMENT';
  END IF;
  IF CHAR_LENGTH(v_content) > 500 THEN
    RAISE EXCEPTION USING errcode = '22001', message = 'COMMENT_TOO_LONG';
  END IF;

  SELECT sp.user_id
  INTO v_post_owner_id
  FROM social_posts sp
  WHERE sp.id = p_post_id
    AND (sp.status = 'published' OR sp.user_id = v_user_id)
  LIMIT 1;

  IF v_post_owner_id IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0002', message = 'POST_NOT_FOUND';
  END IF;

  IF v_post_owner_id <> v_user_id
    AND NOT EXISTS (
      SELECT 1
      FROM user_follows uf
      WHERE uf.follower_id = v_user_id
        AND uf.following_id = v_post_owner_id
    )
  THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'FORBIDDEN';
  END IF;

  INSERT INTO post_comments AS pc (post_id, user_id, content)
  VALUES (p_post_id, v_user_id, v_content)
  RETURNING pc.id, pc.created_at
  INTO v_comment_id, v_created_at;

  UPDATE social_posts sp
  SET comments_count = COALESCE(sp.comments_count, 0) + 1,
      updated_at = NOW()
  WHERE sp.id = p_post_id
  RETURNING sp.comments_count
  INTO v_comments_count;

  RETURN QUERY
  SELECT
    v_comment_id,
    p_post_id,
    v_user_id,
    v_content,
    v_created_at,
    COALESCE(v_comments_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.social_delete_comment_atomic(p_comment_id UUID)
RETURNS TABLE (
  post_id UUID,
  comments_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_user_id UUID;
  v_post_id UUID;
  v_comment_user_id UUID;
  v_comments_count INTEGER := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'UNAUTHORIZED';
  END IF;

  SELECT pc.post_id, pc.user_id
  INTO v_post_id, v_comment_user_id
  FROM post_comments pc
  WHERE pc.id = p_comment_id
  FOR UPDATE;

  IF v_post_id IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0002', message = 'COMMENT_NOT_FOUND';
  END IF;

  IF v_comment_user_id <> v_user_id THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'FORBIDDEN';
  END IF;

  DELETE FROM post_comments pc
  WHERE pc.id = p_comment_id;

  UPDATE social_posts sp
  SET comments_count = GREATEST(COALESCE(sp.comments_count, 0) - 1, 0),
      updated_at = NOW()
  WHERE sp.id = v_post_id
  RETURNING sp.comments_count
  INTO v_comments_count;

  RETURN QUERY SELECT v_post_id, COALESCE(v_comments_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.social_like_post_atomic(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.social_unlike_post_atomic(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.social_add_comment_atomic(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.social_delete_comment_atomic(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.social_like_post_atomic(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.social_unlike_post_atomic(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.social_add_comment_atomic(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.social_delete_comment_atomic(UUID) TO authenticated, service_role;

'use client';

import { useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import { Camera, ImagePlus, X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface CameraCaptureProps {
  onCapture: (image: File) => void;
  onCancel: () => void;
}

/**
 * Camera capture component – opens camera or photo album.
 * Requirement 4.1: Open camera or photo album
 */
export function CameraCapture({ onCapture, onCancel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch {
      setCameraError('无法访问相机，请检查权限设置或从相册选择');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  const takePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `food-${Date.now()}.jpg`, { type: 'image/jpeg' });
        setCapturedFile(file);
        setPreview(URL.createObjectURL(blob));
        stopCamera();
      },
      'image/jpeg',
      0.85,
    );
  }, [stopCamera]);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setCapturedFile(file);
      setPreview(URL.createObjectURL(file));
    },
    [],
  );

  const handleConfirm = useCallback(() => {
    if (capturedFile) {
      onCapture(capturedFile);
    }
  }, [capturedFile, onCapture]);

  const handleRetake = useCallback(() => {
    setPreview(null);
    setCapturedFile(null);
  }, []);

  const handleCancel = useCallback(() => {
    stopCamera();
    onCancel();
  }, [stopCamera, onCancel]);

  return (
    <div className="flex flex-col gap-4">
      {/* Hidden file input for album selection */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
        aria-label="从相册选择照片"
      />

      {/* Preview or camera view */}
      {preview ? (
        <div className="relative">
          <Image
            src={preview}
            alt="食物照片预览"
            width={1280}
            height={960}
            unoptimized
            className="w-full rounded-lg object-cover"
            style={{ maxHeight: '60vh' }}
          />
          <div className="mt-3 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={handleRetake}>
              <RotateCcw className="mr-1 h-4 w-4" />
              重拍
            </Button>
            <Button className="flex-1" onClick={handleConfirm}>
              确认使用
            </Button>
          </div>
        </div>
      ) : stream ? (
        <div className="relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full rounded-lg"
            style={{ maxHeight: '60vh' }}
          />
          <canvas ref={canvasRef} className="hidden" />
          <div className="mt-3 flex gap-2">
            <Button variant="outline" onClick={handleCancel}>
              <X className="mr-1 h-4 w-4" />
              取消
            </Button>
            <Button className="flex-1" onClick={takePhoto}>
              <Camera className="mr-1 h-4 w-4" />
              拍照
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-lg border-2 border-dashed border-muted-foreground/25 p-8">
          {cameraError && (
            <p className="text-center text-sm text-destructive" role="alert">
              {cameraError}
            </p>
          )}
          <p className="text-center text-sm text-muted-foreground">
            拍照或从相册选择食物照片，AI 将自动识别
          </p>
          <div className="flex gap-3">
            <Button onClick={startCamera}>
              <Camera className="mr-1 h-4 w-4" />
              打开相机
            </Button>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus className="mr-1 h-4 w-4" />
              从相册选择
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            取消
          </Button>
        </div>
      )}
    </div>
  );
}

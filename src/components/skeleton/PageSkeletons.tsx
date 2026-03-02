import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function MainPageSkeleton() {
  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <Skeleton className="h-8 w-40" />
      <Card>
        <CardContent className="space-y-3 pt-6">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 pt-6">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    </div>
  );
}

export function MealRecordListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3 py-2">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index}>
          <CardContent className="space-y-3 pt-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-40" />
              <div className="flex gap-2">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-8 w-8 rounded-full" />
              </div>
            </div>
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-3.5 w-4/5" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function StatsPageSkeleton() {
  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-9 w-24" />
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      <Card>
        <CardContent className="space-y-3 pt-6">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-56 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 pt-6">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-56 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export function SocialPageSkeleton() {
  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <Skeleton className="h-8 w-36" />
      <Card>
        <CardContent className="space-y-3 pt-5">
          <Skeleton className="h-20 w-full" />
          <div className="flex justify-between">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-20" />
          </div>
        </CardContent>
      </Card>
      <MealRecordListSkeleton count={2} />
    </div>
  );
}

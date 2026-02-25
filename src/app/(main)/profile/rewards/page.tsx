'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Wallet,
  ArrowDownToLine,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronLeft,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  getRewardBalance,
  getRewardHistory,
  requestWithdrawal,
} from '@/app/actions/withdrawal';
import {
  MIN_WITHDRAWAL_AMOUNT,
  WITHDRAWAL_METHODS,
  calculateWithdrawalFee,
  getWithdrawalMethodLabel,
  getWithdrawalStatusLabel,
  formatWithdrawalAmount,
  getEstimatedProcessingDays,
  type WithdrawalMethod,
} from '@/lib/utils/withdrawal';
import type { RewardTransaction } from '@/types';

/**
 * Rewards page — view balance, request withdrawal, view history.
 * Requirement 13.1-13.9: Reward withdrawal flow
 */
export default function RewardsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: balanceResult, isLoading: balanceLoading } = useQuery({
    queryKey: ['rewardBalance'],
    queryFn: () => getRewardBalance(),
  });

  const { data: historyResult, isLoading: historyLoading } = useQuery({
    queryKey: ['rewardHistory'],
    queryFn: () => getRewardHistory(),
  });

  const balance = balanceResult?.success ? balanceResult.data?.balance ?? 0 : 0;
  const history = historyResult?.success ? historyResult.data ?? [] : [];

  const canWithdraw = balance >= MIN_WITHDRAWAL_AMOUNT;

  return (
    <div className="px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-muted-foreground">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold">我的奖励</h1>
      </div>

      {/* Balance Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="mb-6 bg-gradient-to-br from-orange-50 to-yellow-50">
          <CardContent className="pt-6">
            {balanceLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm text-muted-foreground">可提现余额</p>
                <p className="my-2 text-4xl font-bold text-orange-600">
                  {formatWithdrawalAmount(balance)}
                </p>
                <p className="mb-4 text-xs text-muted-foreground">
                  最低提现金额 {MIN_WITHDRAWAL_AMOUNT} 元
                </p>
                <Button
                  onClick={() => setShowForm(true)}
                  disabled={!canWithdraw}
                  className="w-full"
                >
                  <ArrowDownToLine className="mr-2 h-4 w-4" />
                  {canWithdraw ? '申请提现' : `余额不足 ${MIN_WITHDRAWAL_AMOUNT} 元`}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Withdrawal Form */}
      {showForm && (
        <WithdrawalForm
          balance={balance}
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            queryClient.invalidateQueries({ queryKey: ['rewardBalance'] });
            queryClient.invalidateQueries({ queryKey: ['rewardHistory'] });
          }}
        />
      )}

      {/* Transaction History */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Wallet className="h-5 w-5" />
              奖励记录
            </CardTitle>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : history.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                暂无奖励记录
              </p>
            ) : (
              <div className="space-y-3">
                {history.map((tx) => (
                  <TransactionItem key={tx.id} transaction={tx} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}


function WithdrawalForm({
  balance,
  onClose,
  onSuccess,
}: {
  balance: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<WithdrawalMethod>('wechat');
  const [account, setAccount] = useState('');

  const parsedAmount = parseFloat(amount) || 0;
  const feeInfo = calculateWithdrawalFee(parsedAmount, method);
  const estimatedDays = getEstimatedProcessingDays(method);

  const withdrawMutation = useMutation({
    mutationFn: () =>
      requestWithdrawal({
        amount: parsedAmount,
        method,
        account,
      }),
    onSuccess: (res) => {
      if (res.success) {
        onSuccess();
      }
    },
  });

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
    >
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">申请提现</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="withdrawal-amount">提现金额</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                ¥
              </span>
              <Input
                id="withdrawal-amount"
                type="number"
                placeholder={`最低 ${MIN_WITHDRAWAL_AMOUNT} 元`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-8"
                min={MIN_WITHDRAWAL_AMOUNT}
                max={balance}
                step="0.01"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              可用余额: {formatWithdrawalAmount(balance)}
            </p>
          </div>

          {/* Method */}
          <div className="space-y-2">
            <Label>提现方式</Label>
            <div className="grid grid-cols-3 gap-2">
              {WITHDRAWAL_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`rounded-lg border p-3 text-center text-sm transition-colors ${
                    method === m
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {getWithdrawalMethodLabel(m)}
                </button>
              ))}
            </div>
          </div>

          {/* Account */}
          <div className="space-y-2">
            <Label htmlFor="withdrawal-account">
              {method === 'bank_card' ? '银行卡号' : `${getWithdrawalMethodLabel(method)}账号`}
            </Label>
            <Input
              id="withdrawal-account"
              placeholder={
                method === 'bank_card'
                  ? '请输入银行卡号'
                  : `请输入${getWithdrawalMethodLabel(method)}账号`
              }
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            />
          </div>

          {/* Fee Info */}
          {parsedAmount > 0 && (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">提现金额</span>
                <span>{formatWithdrawalAmount(parsedAmount)}</span>
              </div>
              {feeInfo.fee > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    手续费 ({(feeInfo.feeRate * 100).toFixed(0)}%)
                  </span>
                  <span className="text-destructive">
                    -{formatWithdrawalAmount(feeInfo.fee)}
                  </span>
                </div>
              )}
              <div className="mt-1 flex justify-between border-t pt-1 font-medium">
                <span>实际到账</span>
                <span className="text-primary">
                  {formatWithdrawalAmount(feeInfo.netAmount)}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                预计 {estimatedDays.min === estimatedDays.max
                  ? `${estimatedDays.min} 个工作日`
                  : `${estimatedDays.min}-${estimatedDays.max} 个工作日`}
                到账
              </p>
            </div>
          )}

          {/* Error */}
          {withdrawMutation.data?.success === false && (
            <p className="text-sm text-destructive">{withdrawMutation.data.error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              取消
            </Button>
            <Button
              className="flex-1"
              onClick={() => withdrawMutation.mutate()}
              disabled={withdrawMutation.isPending || parsedAmount <= 0}
            >
              {withdrawMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              确认提现
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function TransactionItem({ transaction }: { transaction: RewardTransaction }) {
  const isWithdrawal = transaction.type === 'withdrawal';
  const isReward = transaction.type === 'daily_reward' || transaction.type === 'pool_bonus';

  const statusIcon = (() => {
    switch (transaction.status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'pending':
      case 'processing':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  })();

  const typeLabel = (() => {
    switch (transaction.type) {
      case 'daily_reward':
        return '每日返现';
      case 'pool_bonus':
        return '奖金池奖励';
      case 'withdrawal':
        return '提现';
      default:
        return '其他';
    }
  })();

  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="flex items-center gap-3">
        {statusIcon}
        <div>
          <p className="text-sm font-medium">{typeLabel}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(transaction.createdAt).toLocaleDateString('zh-CN', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
          {isWithdrawal && transaction.paymentMethod && (
            <p className="text-xs text-muted-foreground">
              {getWithdrawalStatusLabel(transaction.status)}
            </p>
          )}
        </div>
      </div>
      <span
        className={`text-sm font-medium ${
          isReward ? 'text-green-600' : 'text-red-600'
        }`}
      >
        {isReward ? '+' : ''}
        {formatWithdrawalAmount(Math.abs(transaction.amount))}
      </span>
    </div>
  );
}

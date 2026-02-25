'use client';

export interface NutritionBreakdownProps {
  /** Protein in grams */
  protein: number;
  /** Fat in grams */
  fat: number;
  /** Carbs in grams */
  carbs: number;
}

/**
 * Calculate macronutrient ratios as percentages.
 * Uses the 4-9-4 calorie conversion: protein 4kcal/g, fat 9kcal/g, carbs 4kcal/g.
 */
export function calculateMacroRatios(protein: number, fat: number, carbs: number) {
  const proteinCal = protein * 4;
  const fatCal = fat * 9;
  const carbsCal = carbs * 4;
  const total = proteinCal + fatCal + carbsCal;

  if (total === 0) {
    return { proteinPct: 0, fatPct: 0, carbsPct: 0 };
  }

  return {
    proteinPct: Math.round((proteinCal / total) * 100),
    fatPct: Math.round((fatCal / total) * 100),
    carbsPct: Math.round((carbsCal / total) * 100),
  };
}

const nutrients = [
  { key: 'protein' as const, label: '蛋白质', color: 'bg-blue-500' },
  { key: 'fat' as const, label: '脂肪', color: 'bg-yellow-500' },
  { key: 'carbs' as const, label: '碳水', color: 'bg-orange-500' },
];

/**
 * Display protein, fat, carbs intake and their caloric ratios.
 * Requirement 5.6: Show protein, fat, carbs intake and ratios
 */
export function NutritionBreakdown({ protein, fat, carbs }: NutritionBreakdownProps) {
  const { proteinPct, fatPct, carbsPct } = calculateMacroRatios(protein, fat, carbs);
  const pcts = { protein: proteinPct, fat: fatPct, carbs: carbsPct };
  const grams = { protein, fat, carbs };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">营养摄入</h3>

      <div className="grid grid-cols-3 gap-3">
        {nutrients.map(({ key, label, color }) => (
          <div key={key} className="text-center">
            <div className="text-lg font-semibold tabular-nums">
              {Math.round(grams[key])}g
            </div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-xs text-muted-foreground">{pcts[key]}%</div>
          </div>
        ))}
      </div>

      {/* Stacked ratio bar */}
      <div
        className="flex h-2 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`营养占比: 蛋白质 ${proteinPct}%, 脂肪 ${fatPct}%, 碳水 ${carbsPct}%`}
      >
        {proteinPct > 0 && (
          <div className="bg-blue-500 transition-all" style={{ width: `${proteinPct}%` }} />
        )}
        {fatPct > 0 && (
          <div className="bg-yellow-500 transition-all" style={{ width: `${fatPct}%` }} />
        )}
        {carbsPct > 0 && (
          <div className="bg-orange-500 transition-all" style={{ width: `${carbsPct}%` }} />
        )}
      </div>
    </div>
  );
}

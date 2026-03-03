'use client';

import { useState, useMemo } from 'react';
import { Search, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NumberStepperField } from '@/components/form/NumberStepperField';

/** A food entry from the database or custom input */
export interface FoodSearchItem {
  name: string;
  caloriesPerServing: number;
  proteinPerServing: number;
  fatPerServing: number;
  carbsPerServing: number;
  defaultServing: number;
  unit: string;
}

/**
 * Common food database for search.
 * Requirement 3.5: Support searching food database
 */
const COMMON_FOODS: FoodSearchItem[] = [
  { name: '白米饭', caloriesPerServing: 116, proteinPerServing: 2.6, fatPerServing: 0.3, carbsPerServing: 25.9, defaultServing: 100, unit: 'g' },
  { name: '馒头', caloriesPerServing: 221, proteinPerServing: 7, fatPerServing: 1.1, carbsPerServing: 44.2, defaultServing: 100, unit: 'g' },
  { name: '面条(煮)', caloriesPerServing: 110, proteinPerServing: 3.4, fatPerServing: 0.1, carbsPerServing: 24.3, defaultServing: 100, unit: 'g' },
  { name: '鸡蛋(煮)', caloriesPerServing: 144, proteinPerServing: 13.3, fatPerServing: 8.8, carbsPerServing: 2.8, defaultServing: 50, unit: 'g' },
  { name: '鸡胸肉', caloriesPerServing: 133, proteinPerServing: 31.4, fatPerServing: 1.2, carbsPerServing: 0, defaultServing: 100, unit: 'g' },
  { name: '牛肉', caloriesPerServing: 125, proteinPerServing: 19.9, fatPerServing: 4.2, carbsPerServing: 2.2, defaultServing: 100, unit: 'g' },
  { name: '猪肉(瘦)', caloriesPerServing: 143, proteinPerServing: 20.3, fatPerServing: 6.2, carbsPerServing: 1.5, defaultServing: 100, unit: 'g' },
  { name: '三文鱼', caloriesPerServing: 139, proteinPerServing: 21.3, fatPerServing: 5.2, carbsPerServing: 0, defaultServing: 100, unit: 'g' },
  { name: '豆腐', caloriesPerServing: 81, proteinPerServing: 8.1, fatPerServing: 3.7, carbsPerServing: 4.2, defaultServing: 100, unit: 'g' },
  { name: '西兰花', caloriesPerServing: 36, proteinPerServing: 4.1, fatPerServing: 0.6, carbsPerServing: 4.3, defaultServing: 100, unit: 'g' },
  { name: '苹果', caloriesPerServing: 53, proteinPerServing: 0.2, fatPerServing: 0.1, carbsPerServing: 13.5, defaultServing: 200, unit: 'g' },
  { name: '香蕉', caloriesPerServing: 93, proteinPerServing: 1.4, fatPerServing: 0.2, carbsPerServing: 20, defaultServing: 120, unit: 'g' },
  { name: '牛奶', caloriesPerServing: 54, proteinPerServing: 3, fatPerServing: 3.2, carbsPerServing: 3.4, defaultServing: 250, unit: 'ml' },
  { name: '酸奶', caloriesPerServing: 72, proteinPerServing: 2.5, fatPerServing: 2.7, carbsPerServing: 9.3, defaultServing: 200, unit: 'ml' },
];

interface FoodSearchProps {
  onSelect: (food: FoodSearchItem) => void;
}

const CUSTOM_FOOD_DEFAULTS: FoodSearchItem = {
  name: '',
  caloriesPerServing: 100,
  proteinPerServing: 0,
  fatPerServing: 0,
  carbsPerServing: 0,
  defaultServing: 100,
  unit: 'g',
};

export function FoodSearch({ onSelect }: FoodSearchProps) {
  const [query, setQuery] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [customFood, setCustomFood] = useState<FoodSearchItem>(CUSTOM_FOOD_DEFAULTS);
  const [customError, setCustomError] = useState<string | null>(null);

  const filteredFoods = useMemo(() => {
    if (!query.trim()) return COMMON_FOODS;
    const q = query.trim().toLowerCase();
    return COMMON_FOODS.filter((food) => food.name.toLowerCase().includes(q));
  }, [query]);

  const handleCustomSubmit = () => {
    if (!customFood.name.trim()) {
      setCustomError('请输入食物名称');
      return;
    }

    if (customFood.caloriesPerServing < 0) {
      setCustomError('热量不能为负数');
      return;
    }

    if (customFood.defaultServing <= 0) {
      setCustomError('份量必须大于 0');
      return;
    }

    onSelect({
      ...customFood,
      name: customFood.name.trim(),
      unit: customFood.unit.trim() || 'g',
    });

    setCustomFood(CUSTOM_FOOD_DEFAULTS);
    setCustomError(null);
    setShowCustom(false);
  };

  const setCustomNumericField = (
    key: keyof Pick<
      FoodSearchItem,
      'caloriesPerServing' | 'defaultServing' | 'proteinPerServing' | 'fatPerServing' | 'carbsPerServing'
    >,
    value: number | undefined,
  ) => {
    setCustomFood((prev) => ({
      ...prev,
      [key]: value ?? 0,
    }));
    if (customError) {
      setCustomError(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="搜索食物..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
          aria-label="搜索食物"
        />
      </div>

      <ul className="max-h-48 space-y-1 overflow-y-auto" role="listbox" aria-label="食物搜索结果">
        {filteredFoods.map((food) => (
          <li key={food.name} role="option" aria-selected={false}>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-accent"
              onClick={() => onSelect(food)}
            >
              <span>{food.name}</span>
              <span className="text-muted-foreground">
                {food.caloriesPerServing}千卡/{food.defaultServing}{food.unit}
              </span>
            </button>
          </li>
        ))}
        {filteredFoods.length === 0 && (
          <li className="px-3 py-2 text-sm text-muted-foreground">未找到匹配食物</li>
        )}
      </ul>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => setShowCustom(!showCustom)}
      >
        <Plus className="mr-1 h-4 w-4" />
        自定义食物
      </Button>

      {showCustom && (
        <div className="space-y-2 rounded-md border p-3">
          <Input
            placeholder="食物名称"
            value={customFood.name}
            onChange={(e) => {
              setCustomFood({ ...customFood, name: e.target.value });
              if (customError) {
                setCustomError(null);
              }
            }}
            aria-label="自定义食物名称"
          />

          <div className="grid grid-cols-2 gap-2">
            <NumberStepperField
              id="custom-food-calories"
              label="热量"
              unit="千卡"
              min={0}
              max={5000}
              step={1}
              value={customFood.caloriesPerServing}
              fallbackValue={CUSTOM_FOOD_DEFAULTS.caloriesPerServing}
              onChange={(value) => setCustomNumericField('caloriesPerServing', value)}
            />

            <NumberStepperField
              id="custom-food-serving"
              label="份量"
              unit={customFood.unit || 'g'}
              min={1}
              max={5000}
              step={1}
              value={customFood.defaultServing}
              fallbackValue={CUSTOM_FOOD_DEFAULTS.defaultServing}
              onChange={(value) => setCustomNumericField('defaultServing', value)}
            />

            <NumberStepperField
              id="custom-food-protein"
              label="蛋白质"
              unit="g"
              min={0}
              max={500}
              step={0.1}
              value={customFood.proteinPerServing}
              fallbackValue={CUSTOM_FOOD_DEFAULTS.proteinPerServing}
              onChange={(value) => setCustomNumericField('proteinPerServing', value)}
            />

            <NumberStepperField
              id="custom-food-fat"
              label="脂肪"
              unit="g"
              min={0}
              max={500}
              step={0.1}
              value={customFood.fatPerServing}
              fallbackValue={CUSTOM_FOOD_DEFAULTS.fatPerServing}
              onChange={(value) => setCustomNumericField('fatPerServing', value)}
            />

            <NumberStepperField
              id="custom-food-carbs"
              label="碳水"
              unit="g"
              min={0}
              max={500}
              step={0.1}
              value={customFood.carbsPerServing}
              fallbackValue={CUSTOM_FOOD_DEFAULTS.carbsPerServing}
              onChange={(value) => setCustomNumericField('carbsPerServing', value)}
            />

            <div className="space-y-2">
              <Label htmlFor="custom-food-unit">单位</Label>
              <Input
                id="custom-food-unit"
                placeholder="如 g、ml"
                value={customFood.unit}
                onChange={(e) => {
                  setCustomFood({ ...customFood, unit: e.target.value });
                  if (customError) {
                    setCustomError(null);
                  }
                }}
                aria-label="单位"
              />
            </div>
          </div>

          {customError && (
            <p className="text-sm text-destructive" role="alert">
              {customError}
            </p>
          )}

          <Button
            type="button"
            size="sm"
            className="w-full"
            onClick={handleCustomSubmit}
            disabled={!customFood.name.trim()}
          >
            添加自定义食物
          </Button>
        </div>
      )}
    </div>
  );
}
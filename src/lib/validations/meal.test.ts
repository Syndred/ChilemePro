import { describe, it, expect } from 'vitest';
import { createMealRecordSchema, foodItemSchema } from './meal';

const validFood = {
  name: '米饭',
  calories: 230,
  protein: 4.3,
  fat: 0.3,
  carbs: 50.8,
  serving: 200,
  unit: 'g',
};

describe('foodItemSchema', () => {
  it('accepts valid food item', () => {
    const result = foodItemSchema.safeParse(validFood);
    expect(result.success).toBe(true);
  });

  it('rejects empty food name', () => {
    const result = foodItemSchema.safeParse({ ...validFood, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects negative calories', () => {
    const result = foodItemSchema.safeParse({ ...validFood, calories: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects zero serving', () => {
    const result = foodItemSchema.safeParse({ ...validFood, serving: 0 });
    expect(result.success).toBe(false);
  });
});

describe('createMealRecordSchema', () => {
  it('accepts valid meal record', () => {
    const result = createMealRecordSchema.safeParse({
      mealType: 'lunch',
      foods: [validFood],
      recordedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty foods array', () => {
    const result = createMealRecordSchema.safeParse({
      mealType: 'lunch',
      foods: [],
      recordedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid meal type', () => {
    const result = createMealRecordSchema.safeParse({
      mealType: 'brunch',
      foods: [validFood],
      recordedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it('accepts up to 3 meal images', () => {
    const result = createMealRecordSchema.safeParse({
      mealType: 'lunch',
      foods: [validFood],
      imageUrls: [
        'https://example.com/a.jpg',
        'https://example.com/b.jpg',
        'https://example.com/c.jpg',
      ],
      recordedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it('rejects more than 3 meal images', () => {
    const result = createMealRecordSchema.safeParse({
      mealType: 'lunch',
      foods: [validFood],
      imageUrls: [
        'https://example.com/a.jpg',
        'https://example.com/b.jpg',
        'https://example.com/c.jpg',
        'https://example.com/d.jpg',
      ],
      recordedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});

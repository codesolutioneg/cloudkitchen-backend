/**
 * Unit conversion for recipe costing (§33).
 *
 * Pure: no Prisma, no I/O. Everything reduces to one base unit per dimension,
 * so a recipe can call for 150 g of an ingredient bought by the 25 kg sack and
 * the cost still comes out right.
 *
 * Only dimension-safe conversions live here. Anything ingredient-specific
 * (a "bunch" of parsley weighing 60 g) belongs in ingredient_uom_conversions,
 * because it is a property of that ingredient, not of the unit.
 */

import { Decimal } from '@prisma/client/runtime/library';

export const DIMENSIONS = ['mass', 'volume', 'count'] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/** The unit every quantity in a dimension is stored in. */
export const BASE_UOM: Record<Dimension, string> = {
  mass: 'g',
  volume: 'ml',
  count: 'pc',
};

/** How many base units one of each unit is worth. */
const UNIT_TABLE: Record<string, { dimension: Dimension; inBase: string }> = {
  // mass
  mg: { dimension: 'mass', inBase: '0.001' },
  g: { dimension: 'mass', inBase: '1' },
  kg: { dimension: 'mass', inBase: '1000' },
  // volume
  ml: { dimension: 'volume', inBase: '1' },
  cl: { dimension: 'volume', inBase: '10' },
  l: { dimension: 'volume', inBase: '1000' },
  // count
  pc: { dimension: 'count', inBase: '1' },
  piece: { dimension: 'count', inBase: '1' },
  portion: { dimension: 'count', inBase: '1' },
  dozen: { dimension: 'count', inBase: '12' },
};

export const UNITS = Object.keys(UNIT_TABLE);

export class UnitConversionError extends Error {}

function normalise(uom: string): string {
  return uom.trim().toLowerCase();
}

/** @returns The dimension a unit belongs to, or null when it is not a known unit. */
export function dimensionOf(uom: string): Dimension | null {
  return UNIT_TABLE[normalise(uom)]?.dimension ?? null;
}

export function baseUomFor(dimension: Dimension): string {
  return BASE_UOM[dimension];
}

export function isKnownUnit(uom: string): boolean {
  return normalise(uom) in UNIT_TABLE;
}

/**
 * Throws unless the unit can be converted within the expected dimension.
 *
 * @param uom Unit being used, e.g. on a recipe line.
 * @param dimension The dimension the target ingredient lives in.
 */
export function assertConvertible(uom: string, dimension: Dimension): void {
  const found = dimensionOf(uom);
  if (!found) {
    throw new UnitConversionError(`Unknown unit "${uom}"`);
  }
  if (found !== dimension) {
    throw new UnitConversionError(
      `Cannot use ${uom} (${found}) for something measured in ${BASE_UOM[dimension]} (${dimension})`,
    );
  }
}

/**
 * Converts a quantity into the base unit of its dimension.
 *
 * Decimal throughout: a gram of flour costs a fraction of a piastre, and doing
 * this in floating point loses the roll-up over a few hundred lines.
 *
 * @param quantity Amount in `uom`.
 * @param uom Unit the amount is expressed in.
 * @param dimension Dimension the result must belong to.
 * @param extraFactors Ingredient-specific units, base units per one `uom`.
 * @returns The quantity expressed in the dimension's base unit.
 */
export function toBase(
  quantity: Decimal | string | number,
  uom: string,
  dimension: Dimension,
  extraFactors?: Record<string, Decimal | string>,
): Decimal {
  const key = normalise(uom);
  const custom = extraFactors?.[key];
  if (custom !== undefined) {
    return new Decimal(quantity).times(new Decimal(custom));
  }
  assertConvertible(key, dimension);
  return new Decimal(quantity).times(new Decimal(UNIT_TABLE[key]!.inBase));
}

/**
 * Purchase price restated as cost per base unit, after trim loss.
 *
 * "A 25 kg sack costs 900 EGP and 8% is unusable" becomes the cost of one
 * usable gram, which is the only number the recipe roll-up needs.
 *
 * @param yieldPercent Usable share after trim, 0 exclusive to 100 inclusive.
 */
export function costPerBaseUnit(input: {
  purchasePrice: Decimal | string | number;
  purchaseQty: Decimal | string | number;
  purchaseUom: string;
  dimension: Dimension;
  yieldPercent?: Decimal | string | number;
  extraFactors?: Record<string, Decimal | string>;
}): Decimal {
  const qtyInBase = toBase(input.purchaseQty, input.purchaseUom, input.dimension, input.extraFactors);
  if (qtyInBase.lessThanOrEqualTo(0)) {
    throw new UnitConversionError('Purchase quantity must be greater than zero');
  }

  const yieldPercent = new Decimal(input.yieldPercent ?? 100);
  if (yieldPercent.lessThanOrEqualTo(0) || yieldPercent.greaterThan(100)) {
    throw new UnitConversionError('Yield percent must be above 0 and at most 100');
  }

  return new Decimal(input.purchasePrice)
    .dividedBy(qtyInBase)
    .dividedBy(yieldPercent.dividedBy(100))
    .toDecimalPlaces(8);
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Field = {
  key: string;
  label: string;
  short: string;
  unit?: string;
  defaultValue: number;
  step?: number;
};

type ResultKind =
  | "currency"
  | "percent"
  | "number"
  | "index"
  | "multiplier"
  | "years"
  | "quantity"
  | "rate"
  | "seconds";

type Formula = {
  id: string;
  name: string;
  category: string;
  formula: string;
  description: string;
  fields: Field[];
  kind: ResultKind;
  calculate: (values: Record<string, number>) => number;
  display?: (result: number, values: Record<string, number>) => string;
  interpret: (result: number, values: Record<string, number>) => string;
};

const safeDivide = (numerator: number, denominator: number) =>
  denominator === 0 ? Number.NaN : numerator / denominator;

const sigmoid = (value: number) => {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
};

const crraUtility = (wealth: number, riskAversion: number) => {
  if (wealth <= 0) return Number.NaN;
  if (Math.abs(riskAversion - 1) < 1e-9) return Math.log(wealth);
  return (wealth ** (1 - riskAversion) - 1) / (1 - riskAversion);
};

const inverseCrraUtility = (utility: number, riskAversion: number) => {
  if (Math.abs(riskAversion - 1) < 1e-9) return Math.exp(utility);
  const base = (1 - riskAversion) * utility + 1;
  return base > 0 ? base ** (1 / (1 - riskAversion)) : Number.NaN;
};

const crraExpectedUtility = (
  outcomeA: number,
  outcomeB: number,
  probabilityA: number,
  riskAversion: number,
) => {
  const probability = probabilityA / 100;
  return (
    probability * crraUtility(outcomeA, riskAversion) +
    (1 - probability) * crraUtility(outcomeB, riskAversion)
  );
};

const prospectValue = (
  outcome: number,
  reference: number,
  curvature: number,
  lossAversion: number,
) => {
  const change = outcome - reference;
  return change >= 0
    ? change ** curvature
    : -lossAversion * Math.abs(change) ** curvature;
};

const tkProbabilityWeight = (probabilityPercent: number, sensitivity: number) => {
  const probability = probabilityPercent / 100;
  if (probability < 0 || probability > 1 || sensitivity <= 0) {
    return Number.NaN;
  }
  if (probability === 0 || probability === 1) return probability;
  return safeDivide(
    probability ** sensitivity,
    (probability ** sensitivity + (1 - probability) ** sensitivity) **
      (1 / sensitivity),
  );
};

const foundationFormulas: Formula[] = [
  {
    id: "gdp",
    name: "Gross domestic product",
    category: "Macroeconomics",
    formula: "GDP = C + I + G + (X − M)",
    description:
      "Measures the market value of final goods and services produced within an economy.",
    fields: [
      { key: "c", label: "Consumption", short: "C", unit: "$", defaultValue: 14200 },
      { key: "i", label: "Investment", short: "I", unit: "$", defaultValue: 3900 },
      { key: "g", label: "Government spending", short: "G", unit: "$", defaultValue: 4200 },
      { key: "x", label: "Exports", short: "X", unit: "$", defaultValue: 2500 },
      { key: "m", label: "Imports", short: "M", unit: "$", defaultValue: 3100 },
    ],
    kind: "currency",
    calculate: ({ c, i, g, x, m }) => c + i + g + (x - m),
    interpret: (r) =>
      `Total domestic output is ${formatResult(r, "currency")} in the same monetary units as your inputs.`,
  },
  {
    id: "real-gdp",
    name: "Real GDP",
    category: "Macroeconomics",
    formula: "Real GDP = (Nominal GDP ÷ GDP deflator) × 100",
    description:
      "Adjusts nominal output for changes in the overall price level.",
    fields: [
      { key: "nominal", label: "Nominal GDP", short: "NGDP", unit: "$", defaultValue: 27800 },
      { key: "deflator", label: "GDP deflator", short: "D", unit: "index", defaultValue: 121.4 },
    ],
    kind: "currency",
    calculate: ({ nominal, deflator }) => safeDivide(nominal, deflator) * 100,
    interpret: (r) =>
      `Output valued at base-year prices is ${formatResult(r, "currency")}.`,
  },
  {
    id: "gdp-per-capita",
    name: "GDP per capita",
    category: "Macroeconomics",
    formula: "GDP per capita = Real GDP ÷ Population",
    description:
      "A broad estimate of average economic output per person.",
    fields: [
      { key: "gdp", label: "Real GDP", short: "Y", unit: "$m", defaultValue: 22900 },
      { key: "population", label: "Population", short: "N", unit: "m people", defaultValue: 334 },
    ],
    kind: "currency",
    calculate: ({ gdp, population }) => safeDivide(gdp, population) * 1000,
    interpret: (r) =>
      `Average real output is approximately ${formatResult(r, "currency")} per person.`,
  },
  {
    id: "growth",
    name: "Economic growth rate",
    category: "Macroeconomics",
    formula: "Growth = ((Y₁ − Y₀) ÷ Y₀) × 100",
    description:
      "Calculates the percentage change in real output between two periods.",
    fields: [
      { key: "previous", label: "Previous real GDP", short: "Y₀", unit: "$", defaultValue: 21800 },
      { key: "current", label: "Current real GDP", short: "Y₁", unit: "$", defaultValue: 22450 },
    ],
    kind: "percent",
    calculate: ({ previous, current }) =>
      safeDivide(current - previous, previous) * 100,
    interpret: (r) =>
      r >= 0
        ? `Real output expanded by ${formatResult(r, "percent")} over the period.`
        : `Real output contracted by ${formatResult(Math.abs(r), "percent")} over the period.`,
  },
  {
    id: "cpi",
    name: "Consumer price index",
    category: "Macroeconomics",
    formula: "CPI = (Current basket cost ÷ Base basket cost) × 100",
    description:
      "Tracks the price of a representative consumer basket relative to a base period.",
    fields: [
      { key: "current", label: "Current basket cost", short: "P₁", unit: "$", defaultValue: 786 },
      { key: "base", label: "Base basket cost", short: "P₀", unit: "$", defaultValue: 625 },
    ],
    kind: "index",
    calculate: ({ current, base }) => safeDivide(current, base) * 100,
    interpret: (r) =>
      `The basket costs ${formatResult(r - 100, "percent")} more than in the base period.`,
  },
  {
    id: "inflation",
    name: "Inflation rate",
    category: "Macroeconomics",
    formula: "Inflation = ((CPI₁ − CPI₀) ÷ CPI₀) × 100",
    description:
      "Measures the percentage change in the consumer price level.",
    fields: [
      { key: "previous", label: "Previous CPI", short: "CPI₀", unit: "index", defaultValue: 304.7 },
      { key: "current", label: "Current CPI", short: "CPI₁", unit: "index", defaultValue: 313.1 },
    ],
    kind: "percent",
    calculate: ({ previous, current }) =>
      safeDivide(current - previous, previous) * 100,
    interpret: (r) =>
      r >= 0
        ? `The consumer price level rose by ${formatResult(r, "percent")}.`
        : `The consumer price level fell by ${formatResult(Math.abs(r), "percent")}, indicating deflation.`,
  },
  {
    id: "unemployment",
    name: "Unemployment rate",
    category: "Labor & inequality",
    formula: "Unemployment = (Unemployed ÷ Labor force) × 100",
    description:
      "The share of the labor force without a job but actively seeking work.",
    fields: [
      { key: "unemployed", label: "Unemployed people", short: "U", unit: "m", defaultValue: 6.8 },
      { key: "labor", label: "Labor force", short: "LF", unit: "m", defaultValue: 168.1 },
    ],
    kind: "percent",
    calculate: ({ unemployed, labor }) =>
      safeDivide(unemployed, labor) * 100,
    interpret: (r) =>
      `${formatResult(r, "percent")} of the labor force is unemployed under the standard definition.`,
  },
  {
    id: "lfpr",
    name: "Labor force participation",
    category: "Labor & inequality",
    formula: "LFPR = (Labor force ÷ Working-age population) × 100",
    description:
      "The share of working-age people who are employed or actively seeking work.",
    fields: [
      { key: "labor", label: "Labor force", short: "LF", unit: "m", defaultValue: 168.1 },
      { key: "working", label: "Working-age population", short: "WAP", unit: "m", defaultValue: 267.6 },
    ],
    kind: "percent",
    calculate: ({ labor, working }) => safeDivide(labor, working) * 100,
    interpret: (r) =>
      `${formatResult(r, "percent")} of the working-age population participates in the labor market.`,
  },
  {
    id: "money-multiplier",
    name: "Money multiplier",
    category: "Money & banking",
    formula: "Money multiplier = 1 ÷ Reserve ratio",
    description:
      "A simplified estimate of deposit creation under fractional-reserve banking.",
    fields: [
      { key: "reserve", label: "Reserve ratio", short: "rr", unit: "%", defaultValue: 10 },
    ],
    kind: "multiplier",
    calculate: ({ reserve }) => safeDivide(1, reserve / 100),
    interpret: (r) =>
      `In the simplified model, each unit of reserves supports up to ${formatResult(r, "multiplier")} of deposits.`,
  },
  {
    id: "quantity-theory",
    name: "Quantity theory price level",
    category: "Money & banking",
    formula: "P = (M × V) ÷ Y",
    description:
      "Uses the equation of exchange, MV = PY, to solve for the price level.",
    fields: [
      { key: "money", label: "Money supply", short: "M", unit: "$", defaultValue: 21000 },
      { key: "velocity", label: "Velocity of money", short: "V", unit: "×", defaultValue: 1.25 },
      { key: "output", label: "Real output", short: "Y", unit: "$", defaultValue: 22500 },
    ],
    kind: "index",
    calculate: ({ money, velocity, output }) =>
      safeDivide(money * velocity, output),
    interpret: (r) =>
      `The implied aggregate price level is ${formatResult(r, "index")} relative to the units used for real output.`,
  },
  {
    id: "fiscal-multiplier",
    name: "Spending multiplier",
    category: "Money & banking",
    formula: "k = 1 ÷ (1 − MPC)",
    description:
      "Estimates the total change in equilibrium income from a change in autonomous spending.",
    fields: [
      { key: "mpc", label: "Marginal propensity to consume", short: "MPC", unit: "decimal", defaultValue: 0.75, step: 0.01 },
    ],
    kind: "multiplier",
    calculate: ({ mpc }) => safeDivide(1, 1 - mpc),
    interpret: (r) =>
      `Each additional unit of autonomous spending is associated with ${formatResult(r, "multiplier")} of total output in the simple model.`,
  },
  {
    id: "ped",
    name: "Price elasticity of demand",
    category: "Microeconomics",
    formula: "PED = %Δ quantity demanded ÷ %Δ price",
    description:
      "Measures how strongly quantity demanded responds to a change in price.",
    fields: [
      { key: "quantity", label: "Change in quantity demanded", short: "%ΔQd", unit: "%", defaultValue: -12 },
      { key: "price", label: "Change in price", short: "%ΔP", unit: "%", defaultValue: 8 },
    ],
    kind: "number",
    calculate: ({ quantity, price }) => safeDivide(quantity, price),
    interpret: (r) => {
      const a = Math.abs(r);
      if (a > 1) return `Demand is elastic: quantity is relatively responsive to price (|E| = ${formatResult(a, "number")}).`;
      if (a < 1) return `Demand is inelastic: quantity is relatively unresponsive to price (|E| = ${formatResult(a, "number")}).`;
      return "Demand is unit elastic: quantity changes proportionally with price.";
    },
  },
  {
    id: "pes",
    name: "Price elasticity of supply",
    category: "Microeconomics",
    formula: "PES = %Δ quantity supplied ÷ %Δ price",
    description:
      "Measures how strongly quantity supplied responds to a change in price.",
    fields: [
      { key: "quantity", label: "Change in quantity supplied", short: "%ΔQs", unit: "%", defaultValue: 18 },
      { key: "price", label: "Change in price", short: "%ΔP", unit: "%", defaultValue: 12 },
    ],
    kind: "number",
    calculate: ({ quantity, price }) => safeDivide(quantity, price),
    interpret: (r) =>
      Math.abs(r) > 1
        ? `Supply is elastic, with a response coefficient of ${formatResult(r, "number")}.`
        : `Supply is inelastic, with a response coefficient of ${formatResult(r, "number")}.`,
  },
  {
    id: "income-elasticity",
    name: "Income elasticity of demand",
    category: "Microeconomics",
    formula: "YED = %Δ quantity demanded ÷ %Δ income",
    description:
      "Classifies goods by how demand responds to a change in consumer income.",
    fields: [
      { key: "quantity", label: "Change in quantity demanded", short: "%ΔQd", unit: "%", defaultValue: 7 },
      { key: "income", label: "Change in income", short: "%ΔY", unit: "%", defaultValue: 5 },
    ],
    kind: "number",
    calculate: ({ quantity, income }) => safeDivide(quantity, income),
    interpret: (r) =>
      r < 0
        ? `The negative coefficient (${formatResult(r, "number")}) indicates an inferior good.`
        : r > 1
          ? `The coefficient (${formatResult(r, "number")}) indicates a luxury or income-elastic normal good.`
          : `The coefficient (${formatResult(r, "number")}) indicates a necessity or income-inelastic normal good.`,
  },
  {
    id: "cross-elasticity",
    name: "Cross-price elasticity",
    category: "Microeconomics",
    formula: "XED = %Δ demand for A ÷ %Δ price of B",
    description:
      "Indicates whether two goods are substitutes, complements, or unrelated.",
    fields: [
      { key: "quantity", label: "Change in demand for A", short: "%ΔQA", unit: "%", defaultValue: 9 },
      { key: "price", label: "Change in price of B", short: "%ΔPB", unit: "%", defaultValue: 6 },
    ],
    kind: "number",
    calculate: ({ quantity, price }) => safeDivide(quantity, price),
    interpret: (r) =>
      r > 0
        ? `A positive coefficient (${formatResult(r, "number")}) suggests the goods are substitutes.`
        : r < 0
          ? `A negative coefficient (${formatResult(r, "number")}) suggests the goods are complements.`
          : "A coefficient near zero suggests little relationship between the goods.",
  },
  {
    id: "consumer-surplus",
    name: "Consumer surplus",
    category: "Microeconomics",
    formula: "CS = ∫₀Q* Pᴰ(q)dq − P*Q*; linear: ½Q(Pmax − P)",
    description:
      "The area below demand and above price. This calculator evaluates the common linear-demand triangle.",
    fields: [
      { key: "quantity", label: "Quantity traded", short: "Q", unit: "units", defaultValue: 850 },
      { key: "wtp", label: "Maximum willingness to pay", short: "Pmax", unit: "$", defaultValue: 72 },
      { key: "price", label: "Market price", short: "P", unit: "$", defaultValue: 44 },
    ],
    kind: "currency",
    calculate: ({ quantity, wtp, price }) => 0.5 * quantity * (wtp - price),
    interpret: (r) =>
      `Buyers receive an estimated ${formatResult(r, "currency")} of total net benefit.`,
  },
  {
    id: "producer-surplus",
    name: "Producer surplus",
    category: "Microeconomics",
    formula: "PS = P*Q* − ∫₀Q* Pˢ(q)dq; linear: ½Q(P − Pmin)",
    description:
      "The area above supply and below price. This calculator evaluates the common linear-supply triangle.",
    fields: [
      { key: "quantity", label: "Quantity traded", short: "Q", unit: "units", defaultValue: 850 },
      { key: "price", label: "Market price", short: "P", unit: "$", defaultValue: 44 },
      { key: "minimum", label: "Minimum supply price", short: "Pmin", unit: "$", defaultValue: 18 },
    ],
    kind: "currency",
    calculate: ({ quantity, price, minimum }) =>
      0.5 * quantity * (price - minimum),
    interpret: (r) =>
      `Sellers receive an estimated ${formatResult(r, "currency")} of total net benefit.`,
  },
  {
    id: "revenue",
    name: "Total revenue",
    category: "Business economics",
    formula: "TR = Price × Quantity",
    description:
      "Calculates the gross income a firm receives from sales.",
    fields: [
      { key: "price", label: "Price per unit", short: "P", unit: "$", defaultValue: 48 },
      { key: "quantity", label: "Quantity sold", short: "Q", unit: "units", defaultValue: 1250 },
    ],
    kind: "currency",
    calculate: ({ price, quantity }) => price * quantity,
    interpret: (r) =>
      `Gross sales revenue is ${formatResult(r, "currency")} before costs.`,
  },
  {
    id: "profit",
    name: "Economic profit",
    category: "Business economics",
    formula: "Profit = Total revenue − Explicit costs − Implicit costs",
    description:
      "Subtracts both accounting costs and opportunity costs from total revenue.",
    fields: [
      { key: "revenue", label: "Total revenue", short: "TR", unit: "$", defaultValue: 180000 },
      { key: "explicit", label: "Explicit costs", short: "EC", unit: "$", defaultValue: 128000 },
      { key: "implicit", label: "Implicit costs", short: "IC", unit: "$", defaultValue: 22000 },
    ],
    kind: "currency",
    calculate: ({ revenue, explicit, implicit }) =>
      revenue - explicit - implicit,
    interpret: (r) =>
      r >= 0
        ? `The firm earns ${formatResult(r, "currency")} above all explicit and opportunity costs.`
        : `The firm has an economic loss of ${formatResult(Math.abs(r), "currency")}.`,
  },
  {
    id: "break-even",
    name: "Break-even quantity",
    category: "Business economics",
    formula: "Q* = Fixed costs ÷ (Price − Variable cost per unit)",
    description:
      "Finds the sales volume at which total revenue equals total cost.",
    fields: [
      { key: "fixed", label: "Fixed costs", short: "FC", unit: "$", defaultValue: 72000 },
      { key: "price", label: "Price per unit", short: "P", unit: "$", defaultValue: 54 },
      { key: "variable", label: "Variable cost per unit", short: "VC", unit: "$", defaultValue: 30 },
    ],
    kind: "quantity",
    calculate: ({ fixed, price, variable }) =>
      safeDivide(fixed, price - variable),
    interpret: (r) =>
      `The firm must sell about ${formatResult(Math.ceil(r), "quantity")} to cover all costs.`,
  },
  {
    id: "marginal-product",
    name: "Marginal product of labor",
    category: "Business economics",
    formula: "MPL = Change in output ÷ Change in labor",
    description:
      "Measures the additional output produced by one more unit of labor input.",
    fields: [
      { key: "output", label: "Change in output", short: "ΔQ", unit: "units", defaultValue: 480 },
      { key: "labor", label: "Change in labor", short: "ΔL", unit: "workers", defaultValue: 12 },
    ],
    kind: "quantity",
    calculate: ({ output, labor }) => safeDivide(output, labor),
    interpret: (r) =>
      `Each additional unit of labor adds ${formatResult(r, "quantity")} on average over this interval.`,
  },
  {
    id: "hhi",
    name: "Market concentration (HHI)",
    category: "Business economics",
    formula: "HHI = s₁² + s₂² + s₃² + s₄²",
    description:
      "Sums squared market shares. Add the shares of the four firms being analyzed.",
    fields: [
      { key: "s1", label: "Firm 1 market share", short: "s₁", unit: "%", defaultValue: 35 },
      { key: "s2", label: "Firm 2 market share", short: "s₂", unit: "%", defaultValue: 27 },
      { key: "s3", label: "Firm 3 market share", short: "s₃", unit: "%", defaultValue: 18 },
      { key: "s4", label: "Firm 4 market share", short: "s₄", unit: "%", defaultValue: 12 },
    ],
    kind: "index",
    calculate: ({ s1, s2, s3, s4 }) =>
      s1 ** 2 + s2 ** 2 + s3 ** 2 + s4 ** 2,
    interpret: (r) =>
      r < 1500
        ? `An HHI of ${formatResult(r, "index")} is generally consistent with an unconcentrated market.`
        : r < 2500
          ? `An HHI of ${formatResult(r, "index")} is generally consistent with moderate concentration.`
          : `An HHI of ${formatResult(r, "index")} is generally consistent with high concentration.`,
  },
  {
    id: "present-value",
    name: "Present value",
    category: "Finance & investment",
    formula: "PV = FV ÷ (1 + r)ⁿ",
    description:
      "Discounts a future cash amount into today’s money.",
    fields: [
      { key: "future", label: "Future value", short: "FV", unit: "$", defaultValue: 10000 },
      { key: "rate", label: "Discount rate", short: "r", unit: "%", defaultValue: 6 },
      { key: "years", label: "Number of years", short: "n", unit: "years", defaultValue: 5 },
    ],
    kind: "currency",
    calculate: ({ future, rate, years }) =>
      safeDivide(future, (1 + rate / 100) ** years),
    interpret: (r) =>
      `The future cash flow is worth ${formatResult(r, "currency")} today at the chosen discount rate.`,
  },
  {
    id: "future-value",
    name: "Future value",
    category: "Finance & investment",
    formula: "FV = PV × (1 + r)ⁿ",
    description:
      "Compounds a present amount forward at a constant annual rate.",
    fields: [
      { key: "present", label: "Present value", short: "PV", unit: "$", defaultValue: 10000 },
      { key: "rate", label: "Annual rate", short: "r", unit: "%", defaultValue: 6 },
      { key: "years", label: "Number of years", short: "n", unit: "years", defaultValue: 5 },
    ],
    kind: "currency",
    calculate: ({ present, rate, years }) =>
      present * (1 + rate / 100) ** years,
    interpret: (r) =>
      `The investment grows to ${formatResult(r, "currency")} after compounding.`,
  },
  {
    id: "npv",
    name: "Net present value",
    category: "Finance & investment",
    formula: "NPV = −I₀ + CF₁/(1+r) + CF₂/(1+r)² + CF₃/(1+r)³",
    description:
      "Values a three-year stream of cash flows after the initial investment.",
    fields: [
      { key: "initial", label: "Initial investment", short: "I₀", unit: "$", defaultValue: 50000 },
      { key: "cf1", label: "Year 1 cash flow", short: "CF₁", unit: "$", defaultValue: 20000 },
      { key: "cf2", label: "Year 2 cash flow", short: "CF₂", unit: "$", defaultValue: 22000 },
      { key: "cf3", label: "Year 3 cash flow", short: "CF₃", unit: "$", defaultValue: 24000 },
      { key: "rate", label: "Discount rate", short: "r", unit: "%", defaultValue: 8 },
    ],
    kind: "currency",
    calculate: ({ initial, cf1, cf2, cf3, rate }) => {
      const r = 1 + rate / 100;
      return -initial + cf1 / r + cf2 / r ** 2 + cf3 / r ** 3;
    },
    interpret: (r) =>
      r >= 0
        ? `The project adds ${formatResult(r, "currency")} of value at the selected discount rate.`
        : `The project falls short by ${formatResult(Math.abs(r), "currency")} at the selected discount rate.`,
  },
  {
    id: "real-interest",
    name: "Real interest rate",
    category: "Finance & investment",
    formula: "Real rate = ((1 + nominal rate) ÷ (1 + inflation)) − 1",
    description:
      "Uses the exact Fisher relationship to remove inflation from a nominal return.",
    fields: [
      { key: "nominal", label: "Nominal interest rate", short: "i", unit: "%", defaultValue: 7 },
      { key: "inflation", label: "Inflation rate", short: "π", unit: "%", defaultValue: 3 },
    ],
    kind: "percent",
    calculate: ({ nominal, inflation }) =>
      (safeDivide(1 + nominal / 100, 1 + inflation / 100) - 1) * 100,
    interpret: (r) =>
      `Purchasing power changes by ${formatResult(r, "percent")} after accounting for inflation.`,
  },
  {
    id: "cagr",
    name: "Compound annual growth rate",
    category: "Finance & investment",
    formula: "CAGR = ((Ending ÷ Beginning)¹⁄ⁿ − 1) × 100",
    description:
      "Finds the constant annual rate that links a beginning and ending value.",
    fields: [
      { key: "beginning", label: "Beginning value", short: "BV", unit: "$", defaultValue: 12500 },
      { key: "ending", label: "Ending value", short: "EV", unit: "$", defaultValue: 18400 },
      { key: "years", label: "Number of years", short: "n", unit: "years", defaultValue: 4 },
    ],
    kind: "percent",
    calculate: ({ beginning, ending, years }) =>
      (safeDivide(ending, beginning) ** safeDivide(1, years) - 1) * 100,
    interpret: (r) =>
      `The value grew at an annualized rate of ${formatResult(r, "percent")}.`,
  },
  {
    id: "rule-of-70",
    name: "Rule of 70",
    category: "Finance & investment",
    formula: "Doubling time ≈ 70 ÷ Growth rate",
    description:
      "Quickly estimates how long a steadily growing quantity takes to double.",
    fields: [
      { key: "rate", label: "Annual growth rate", short: "g", unit: "%", defaultValue: 3.5 },
    ],
    kind: "years",
    calculate: ({ rate }) => safeDivide(70, rate),
    interpret: (r) =>
      `At a steady rate, the quantity would double in approximately ${formatResult(r, "years")}.`,
  },
  {
    id: "opportunity-cost",
    name: "Opportunity cost",
    category: "Trade & exchange",
    formula: "Cost of A = Units of B forgone ÷ Units of A gained",
    description:
      "Expresses the next-best alternative sacrificed to produce one more unit.",
    fields: [
      { key: "forgone", label: "Units of B forgone", short: "ΔB", unit: "units", defaultValue: 24 },
      { key: "gained", label: "Units of A gained", short: "ΔA", unit: "units", defaultValue: 8 },
    ],
    kind: "rate",
    calculate: ({ forgone, gained }) => safeDivide(forgone, gained),
    interpret: (r) =>
      `Each additional unit of A costs ${formatResult(r, "rate")} of B.`,
  },
  {
    id: "terms-of-trade",
    name: "Terms of trade",
    category: "Trade & exchange",
    formula: "TOT = (Export price index ÷ Import price index) × 100",
    description:
      "Compares the prices a country receives for exports with the prices it pays for imports.",
    fields: [
      { key: "exports", label: "Export price index", short: "PX", unit: "index", defaultValue: 118 },
      { key: "imports", label: "Import price index", short: "PM", unit: "index", defaultValue: 109 },
    ],
    kind: "index",
    calculate: ({ exports, imports }) => safeDivide(exports, imports) * 100,
    interpret: (r) =>
      r >= 100
        ? `At ${formatResult(r, "index")}, export prices are favorable relative to import prices versus the base.`
        : `At ${formatResult(r, "index")}, import prices are high relative to export prices versus the base.`,
  },
  {
    id: "ppp",
    name: "Purchasing power parity",
    category: "Trade & exchange",
    formula: "PPP exchange rate = Domestic basket price ÷ Foreign basket price",
    description:
      "Estimates the exchange rate that equalizes the price of an identical basket across countries.",
    fields: [
      { key: "domestic", label: "Domestic basket price", short: "Pd", unit: "local", defaultValue: 520000 },
      { key: "foreign", label: "Foreign basket price", short: "Pf", unit: "foreign", defaultValue: 32 },
    ],
    kind: "rate",
    calculate: ({ domestic, foreign }) => safeDivide(domestic, foreign),
    interpret: (r) =>
      `PPP implies ${formatResult(r, "rate")} domestic currency units per unit of foreign currency.`,
  },
  {
    id: "tax-revenue",
    name: "Tax revenue",
    category: "Public economics",
    formula: "Tax revenue = Tax per unit × Quantity after tax",
    description:
      "Calculates government revenue from a per-unit tax.",
    fields: [
      { key: "tax", label: "Tax per unit", short: "t", unit: "$", defaultValue: 6 },
      { key: "quantity", label: "Quantity after tax", short: "Qt", unit: "units", defaultValue: 7800 },
    ],
    kind: "currency",
    calculate: ({ tax, quantity }) => tax * quantity,
    interpret: (r) =>
      `The per-unit tax raises ${formatResult(r, "currency")} at the post-tax quantity.`,
  },
  {
    id: "dwl",
    name: "Deadweight loss of a tax",
    category: "Public economics",
    formula: "DWL = ½ × Tax per unit × Reduction in quantity",
    description:
      "Estimates the value of mutually beneficial trades prevented by a tax.",
    fields: [
      { key: "tax", label: "Tax per unit", short: "t", unit: "$", defaultValue: 6 },
      { key: "reduction", label: "Reduction in quantity", short: "ΔQ", unit: "units", defaultValue: 1200 },
    ],
    kind: "currency",
    calculate: ({ tax, reduction }) => 0.5 * tax * reduction,
    interpret: (r) =>
      `The estimated lost total surplus is ${formatResult(r, "currency")}.`,
  },
  {
    id: "expected-value",
    name: "Expected value of a gamble",
    category: "Behavioral decision science",
    formula: "EV = p × x₁ + (1 − p) × x₂",
    description:
      "A risk-neutral benchmark for a two-outcome lottery before subjective utility or probability weighting.",
    fields: [
      { key: "outcomeA", label: "Outcome A", short: "x₁", unit: "$", defaultValue: 120 },
      { key: "outcomeB", label: "Outcome B", short: "x₂", unit: "$", defaultValue: 20 },
      { key: "probability", label: "Probability of A", short: "p", unit: "%", defaultValue: 60 },
    ],
    kind: "currency",
    calculate: ({ outcomeA, outcomeB, probability }) =>
      (probability / 100) * outcomeA +
      (1 - probability / 100) * outcomeB,
    interpret: (r) =>
      `Across many identical choices, the average monetary payoff is ${formatResult(r, "currency")}.`,
  },
  {
    id: "crra-utility",
    name: "CRRA subjective utility",
    category: "Behavioral decision science",
    formula: "u(x) = (x¹⁻ʳ − 1) ÷ (1 − r); u(x) = ln(x) when r = 1",
    description:
      "Transforms positive wealth using constant relative risk aversion. Larger r represents stronger curvature.",
    fields: [
      { key: "wealth", label: "Wealth or payoff", short: "x", unit: "$", defaultValue: 100 },
      { key: "risk", label: "Relative risk aversion", short: "r", unit: "coefficient", defaultValue: 0.7, step: 0.05 },
    ],
    kind: "number",
    calculate: ({ wealth, risk }) => crraUtility(wealth, risk),
    interpret: (r) =>
      `The payoff maps to ${formatResult(r, "number")} utility units under the selected CRRA curvature.`,
  },
  {
    id: "expected-utility",
    name: "CRRA expected utility",
    category: "Behavioral decision science",
    formula: "EU = p × u(x₁) + (1 − p) × u(x₂)",
    description:
      "Combines two positive outcomes using CRRA utility and objective probabilities.",
    fields: [
      { key: "outcomeA", label: "Outcome A", short: "x₁", unit: "$", defaultValue: 160 },
      { key: "outcomeB", label: "Outcome B", short: "x₂", unit: "$", defaultValue: 40 },
      { key: "probability", label: "Probability of A", short: "p", unit: "%", defaultValue: 50 },
      { key: "risk", label: "Relative risk aversion", short: "r", unit: "coefficient", defaultValue: 0.7, step: 0.05 },
    ],
    kind: "number",
    calculate: ({ outcomeA, outcomeB, probability, risk }) =>
      crraExpectedUtility(outcomeA, outcomeB, probability, risk),
    interpret: (r) =>
      `The lottery has ${formatResult(r, "number")} expected utility units under these preferences.`,
  },
  {
    id: "certainty-equivalent",
    name: "CRRA certainty equivalent",
    category: "Behavioral decision science",
    formula: "CE = u⁻¹[p × u(x₁) + (1 − p) × u(x₂)]",
    description:
      "Finds the guaranteed positive payoff with the same CRRA utility as a two-outcome gamble.",
    fields: [
      { key: "outcomeA", label: "Outcome A", short: "x₁", unit: "$", defaultValue: 160 },
      { key: "outcomeB", label: "Outcome B", short: "x₂", unit: "$", defaultValue: 40 },
      { key: "probability", label: "Probability of A", short: "p", unit: "%", defaultValue: 50 },
      { key: "risk", label: "Relative risk aversion", short: "r", unit: "coefficient", defaultValue: 0.7, step: 0.05 },
    ],
    kind: "currency",
    calculate: ({ outcomeA, outcomeB, probability, risk }) =>
      inverseCrraUtility(
        crraExpectedUtility(outcomeA, outcomeB, probability, risk),
        risk,
      ),
    interpret: (r) =>
      `A sure ${formatResult(r, "currency")} has the same modeled utility as the gamble.`,
  },
  {
    id: "behavioral-risk-premium",
    name: "Utility-based risk premium",
    category: "Behavioral decision science",
    formula: "Risk premium = Expected value − Certainty equivalent",
    description:
      "Measures how much expected money a CRRA decision-maker would give up to remove uncertainty.",
    fields: [
      { key: "outcomeA", label: "Outcome A", short: "x₁", unit: "$", defaultValue: 160 },
      { key: "outcomeB", label: "Outcome B", short: "x₂", unit: "$", defaultValue: 40 },
      { key: "probability", label: "Probability of A", short: "p", unit: "%", defaultValue: 50 },
      { key: "risk", label: "Relative risk aversion", short: "r", unit: "coefficient", defaultValue: 0.7, step: 0.05 },
    ],
    kind: "currency",
    calculate: ({ outcomeA, outcomeB, probability, risk }) => {
      const p = probability / 100;
      const expectedValue = p * outcomeA + (1 - p) * outcomeB;
      const certaintyEquivalent = inverseCrraUtility(
        crraExpectedUtility(outcomeA, outcomeB, probability, risk),
        risk,
      );
      return expectedValue - certaintyEquivalent;
    },
    interpret: (r) =>
      r >= 0
        ? `The modeled cost of risk is ${formatResult(r, "currency")}.`
        : `The negative premium (${formatResult(r, "currency")}) indicates risk-seeking preferences for this gamble.`,
  },
  {
    id: "prospect-value",
    name: "Prospect theory value",
    category: "Behavioral decision science",
    formula: "v(x) = (x − R)ᵅ for gains; −λ(R − x)ᵅ for losses",
    description:
      "Evaluates an outcome relative to a reference point with diminishing sensitivity and loss aversion.",
    fields: [
      { key: "outcome", label: "Outcome", short: "x", unit: "$", defaultValue: -80 },
      { key: "reference", label: "Reference point", short: "R", unit: "$", defaultValue: 0 },
      { key: "curvature", label: "Value curvature", short: "α", unit: "coefficient", defaultValue: 0.88, step: 0.01 },
      { key: "loss", label: "Loss aversion", short: "λ", unit: "coefficient", defaultValue: 2.25, step: 0.05 },
    ],
    kind: "number",
    calculate: ({ outcome, reference, curvature, loss }) =>
      prospectValue(outcome, reference, curvature, loss),
    interpret: (r) =>
      `The reference-dependent subjective value is ${formatResult(r, "number")} units.`,
  },
  {
    id: "tk-probability-weighting",
    name: "Prospect probability weighting",
    category: "Behavioral decision science",
    formula: "w(p) = pᵞ ÷ [pᵞ + (1 − p)ᵞ]¹⁄ᵞ",
    description:
      "Applies the Tversky–Kahneman weighting form to an objective probability.",
    fields: [
      { key: "probability", label: "Objective probability", short: "p", unit: "%", defaultValue: 10 },
      { key: "sensitivity", label: "Weighting sensitivity", short: "γ", unit: "coefficient", defaultValue: 0.61, step: 0.01 },
    ],
    kind: "percent",
    calculate: ({ probability, sensitivity }) =>
      tkProbabilityWeight(probability, sensitivity) * 100,
    interpret: (r) =>
      `The objective chance is represented as a ${formatResult(r, "percent")} decision weight.`,
  },
  {
    id: "prelec-weighting",
    name: "Prelec probability weighting",
    category: "Behavioral decision science",
    formula: "w(p) = exp[−(−ln p)ᵅ]",
    description:
      "Uses the one-parameter Prelec function to transform an objective probability.",
    fields: [
      { key: "probability", label: "Objective probability", short: "p", unit: "%", defaultValue: 10 },
      { key: "curvature", label: "Weighting curvature", short: "α", unit: "coefficient", defaultValue: 0.7, step: 0.01 },
    ],
    kind: "percent",
    calculate: ({ probability, curvature }) => {
      const p = probability / 100;
      if (p < 0 || p > 1 || curvature <= 0) return Number.NaN;
      if (p === 0 || p === 1) return p * 100;
      return Math.exp(-((-Math.log(p)) ** curvature)) * 100;
    },
    interpret: (r) =>
      `The transformed decision weight is ${formatResult(r, "percent")}.`,
  },
  {
    id: "subjective-lottery",
    name: "Simplified prospect-weighted lottery",
    category: "Behavioral decision science",
    formula: "SV = w(p) × v(x₁) + w(1 − p) × v(x₂)",
    description:
      "A transparent two-outcome prospect approximation combining reference-dependent value and probability weights.",
    fields: [
      { key: "outcomeA", label: "Outcome A", short: "x₁", unit: "$", defaultValue: 120 },
      { key: "outcomeB", label: "Outcome B", short: "x₂", unit: "$", defaultValue: -60 },
      { key: "probability", label: "Probability of A", short: "p", unit: "%", defaultValue: 45 },
      { key: "curvature", label: "Value curvature", short: "α", unit: "coefficient", defaultValue: 0.88, step: 0.01 },
      { key: "loss", label: "Loss aversion", short: "λ", unit: "coefficient", defaultValue: 2.25, step: 0.05 },
      { key: "weight", label: "Weighting sensitivity", short: "γ", unit: "coefficient", defaultValue: 0.61, step: 0.01 },
    ],
    kind: "number",
    calculate: ({ outcomeA, outcomeB, probability, curvature, loss, weight }) =>
      tkProbabilityWeight(probability, weight) *
        prospectValue(outcomeA, 0, curvature, loss) +
      tkProbabilityWeight(100 - probability, weight) *
        prospectValue(outcomeB, 0, curvature, loss),
    interpret: (r) =>
      `The simplified reference-dependent lottery score is ${formatResult(r, "number")}.`,
  },
  {
    id: "implied-loss-aversion",
    name: "Implied loss aversion",
    category: "Behavioral decision science",
    formula: "λ = |Subjective loss| ÷ Subjective gain",
    description:
      "Estimates how strongly a measured loss response outweighs a same-context gain response.",
    fields: [
      { key: "lossResponse", label: "Subjective loss response", short: "v(−x)", unit: "units", defaultValue: -45 },
      { key: "gainResponse", label: "Subjective gain response", short: "v(x)", unit: "units", defaultValue: 20 },
    ],
    kind: "multiplier",
    calculate: ({ lossResponse, gainResponse }) =>
      safeDivide(Math.abs(lossResponse), Math.abs(gainResponse)),
    interpret: (r) =>
      `The loss response is ${formatResult(r, "multiplier")} as large as the gain response.`,
  },
  {
    id: "hyperbolic-discounting",
    name: "Hyperbolic discounted value",
    category: "Behavioral decision science",
    formula: "V = A ÷ (1 + kD)",
    description:
      "Models present-biased valuation of a delayed reward using a hyperbolic discount rate.",
    fields: [
      { key: "amount", label: "Delayed reward", short: "A", unit: "$", defaultValue: 100 },
      { key: "discount", label: "Discount rate per period", short: "k", unit: "coefficient", defaultValue: 0.08, step: 0.01 },
      { key: "delay", label: "Delay", short: "D", unit: "periods", defaultValue: 12 },
    ],
    kind: "currency",
    calculate: ({ amount, discount, delay }) =>
      safeDivide(amount, 1 + discount * delay),
    interpret: (r) =>
      `The delayed reward has a modeled present subjective value of ${formatResult(r, "currency")}.`,
  },
  {
    id: "exponential-discounting",
    name: "Exponential discounted value",
    category: "Behavioral decision science",
    formula: "V = A × δᴰ",
    description:
      "Models time-consistent discounting with a constant per-period discount factor.",
    fields: [
      { key: "amount", label: "Delayed reward", short: "A", unit: "$", defaultValue: 100 },
      { key: "factor", label: "Discount factor", short: "δ", unit: "0–1", defaultValue: 0.95, step: 0.01 },
      { key: "delay", label: "Delay", short: "D", unit: "periods", defaultValue: 12 },
    ],
    kind: "currency",
    calculate: ({ amount, factor, delay }) => amount * factor ** delay,
    interpret: (r) =>
      `The reward’s exponentially discounted value is ${formatResult(r, "currency")}.`,
  },
  {
    id: "beta-delta-discounting",
    name: "Quasi-hyperbolic β–δ value",
    category: "Behavioral decision science",
    formula: "V₀ = A now; Vₜ = β × δᵗ × A when t > 0",
    description:
      "Separates immediate present bias (β) from standard long-run discounting (δ).",
    fields: [
      { key: "amount", label: "Reward", short: "A", unit: "$", defaultValue: 100 },
      { key: "presentBias", label: "Present-bias factor", short: "β", unit: "0–1", defaultValue: 0.7, step: 0.01 },
      { key: "factor", label: "Long-run factor", short: "δ", unit: "0–1", defaultValue: 0.96, step: 0.01 },
      { key: "delay", label: "Delay", short: "t", unit: "periods", defaultValue: 6 },
    ],
    kind: "currency",
    calculate: ({ amount, presentBias, factor, delay }) =>
      delay === 0 ? amount : presentBias * factor ** delay * amount,
    interpret: (r) =>
      `The β–δ subjective value is ${formatResult(r, "currency")}.`,
  },
  {
    id: "implied-hyperbolic-k",
    name: "Implied delay discount rate",
    category: "Behavioral decision science",
    formula: "k = (A ÷ V − 1) ÷ D",
    description:
      "Infers the hyperbolic discount parameter from an immediate–delayed indifference point.",
    fields: [
      { key: "delayed", label: "Delayed amount", short: "A", unit: "$", defaultValue: 100 },
      { key: "immediate", label: "Immediate equivalent", short: "V", unit: "$", defaultValue: 62.5 },
      { key: "delay", label: "Delay", short: "D", unit: "periods", defaultValue: 12 },
    ],
    kind: "number",
    calculate: ({ delayed, immediate, delay }) =>
      safeDivide(safeDivide(delayed, immediate) - 1, delay),
    interpret: (r) =>
      `The indifference point implies k = ${formatResult(r, "number")} per delay period.`,
  },
  {
    id: "probability-discounting",
    name: "Probability-discounted value",
    category: "Behavioral decision science",
    formula: "V = A ÷ [1 + h × ((1 − p) ÷ p)]",
    description:
      "Discounts a probabilistic reward by the odds against receiving it.",
    fields: [
      { key: "amount", label: "Reward amount", short: "A", unit: "$", defaultValue: 100 },
      { key: "probability", label: "Reward probability", short: "p", unit: "%", defaultValue: 40 },
      { key: "discount", label: "Probability discount rate", short: "h", unit: "coefficient", defaultValue: 1.2, step: 0.05 },
    ],
    kind: "currency",
    calculate: ({ amount, probability, discount }) => {
      const p = probability / 100;
      return safeDivide(amount, 1 + discount * safeDivide(1 - p, p));
    },
    interpret: (r) =>
      `The probability-discounted subjective value is ${formatResult(r, "currency")}.`,
  },
  {
    id: "softmax-choice",
    name: "Softmax choice probability",
    category: "Neuroeconomics",
    formula: "P(A) = 1 ÷ [1 + exp(−β(QA − QB))]",
    description:
      "Maps a difference in learned option values to a stochastic binary choice probability.",
    fields: [
      { key: "valueA", label: "Value of option A", short: "QA", unit: "value", defaultValue: 7.5 },
      { key: "valueB", label: "Value of option B", short: "QB", unit: "value", defaultValue: 5 },
      { key: "beta", label: "Inverse temperature", short: "β", unit: "coefficient", defaultValue: 1.2, step: 0.05 },
    ],
    kind: "percent",
    calculate: ({ valueA, valueB, beta }) =>
      sigmoid(beta * (valueA - valueB)) * 100,
    interpret: (r) =>
      `The model assigns option A a ${formatResult(r, "percent")} choice probability.`,
  },
  {
    id: "inverse-temperature",
    name: "Implied inverse temperature",
    category: "Neuroeconomics",
    formula: "β = ln[P(A) ÷ (1 − P(A))] ÷ (QA − QB)",
    description:
      "Infers binary softmax choice consistency from an observed choice probability and value difference.",
    fields: [
      { key: "probability", label: "Observed P(A)", short: "P(A)", unit: "%", defaultValue: 80 },
      { key: "valueA", label: "Value of option A", short: "QA", unit: "value", defaultValue: 7.5 },
      { key: "valueB", label: "Value of option B", short: "QB", unit: "value", defaultValue: 5 },
    ],
    kind: "number",
    calculate: ({ probability, valueA, valueB }) => {
      const p = probability / 100;
      return safeDivide(Math.log(safeDivide(p, 1 - p)), valueA - valueB);
    },
    interpret: (r) =>
      `The observed consistency implies β = ${formatResult(r, "number")}.`,
  },
  {
    id: "reward-prediction-error",
    name: "Reward prediction error",
    category: "Neuroeconomics",
    formula: "δ = Reward − Expected value",
    description:
      "Computes the signed surprise signal that drives simple reinforcement learning updates.",
    fields: [
      { key: "reward", label: "Received reward", short: "r", unit: "value", defaultValue: 10 },
      { key: "expected", label: "Expected reward", short: "V", unit: "value", defaultValue: 6 },
    ],
    kind: "number",
    calculate: ({ reward, expected }) => reward - expected,
    interpret: (r) =>
      r >= 0
        ? `The outcome is better than expected by ${formatResult(r, "number")} value units.`
        : `The outcome is worse than expected by ${formatResult(Math.abs(r), "number")} value units.`,
  },
  {
    id: "rescorla-wagner",
    name: "Rescorla–Wagner value update",
    category: "Neuroeconomics",
    formula: "Vₜ₊₁ = Vₜ + α(rₜ − Vₜ)",
    description:
      "Updates an expected value using a reward prediction error and learning rate.",
    fields: [
      { key: "value", label: "Current expected value", short: "Vₜ", unit: "value", defaultValue: 6 },
      { key: "reward", label: "Received reward", short: "rₜ", unit: "value", defaultValue: 10 },
      { key: "alpha", label: "Learning rate", short: "α", unit: "0–1", defaultValue: 0.25, step: 0.01 },
    ],
    kind: "number",
    calculate: ({ value, reward, alpha }) =>
      value + alpha * (reward - value),
    interpret: (r) =>
      `The next expected value is ${formatResult(r, "number")} after the prediction-error update.`,
  },
  {
    id: "td-error",
    name: "Temporal-difference error",
    category: "Neuroeconomics",
    formula: "δₜ = rₜ + γV(sₜ₊₁) − V(sₜ)",
    description:
      "Compares the current value estimate with reward plus the discounted value of the next state.",
    fields: [
      { key: "reward", label: "Current reward", short: "rₜ", unit: "value", defaultValue: 2 },
      { key: "next", label: "Next-state value", short: "V(sₜ₊₁)", unit: "value", defaultValue: 8 },
      { key: "current", label: "Current-state value", short: "V(sₜ)", unit: "value", defaultValue: 6 },
      { key: "gamma", label: "Future discount factor", short: "γ", unit: "0–1", defaultValue: 0.9, step: 0.01 },
    ],
    kind: "number",
    calculate: ({ reward, next, current, gamma }) =>
      reward + gamma * next - current,
    interpret: (r) =>
      `The signed temporal-difference signal is ${formatResult(r, "number")}.`,
  },
  {
    id: "q-learning",
    name: "Q-learning action-value update",
    category: "Neuroeconomics",
    formula: "Qₜ₊₁ = Qₜ + α[r + γ max Q′ − Qₜ]",
    description:
      "Updates a chosen action’s value from reward and the best estimated value in the next state.",
    fields: [
      { key: "current", label: "Current action value", short: "Qₜ", unit: "value", defaultValue: 5 },
      { key: "reward", label: "Received reward", short: "r", unit: "value", defaultValue: 2 },
      { key: "next", label: "Best next action value", short: "max Q′", unit: "value", defaultValue: 7 },
      { key: "alpha", label: "Learning rate", short: "α", unit: "0–1", defaultValue: 0.2, step: 0.01 },
      { key: "gamma", label: "Future discount factor", short: "γ", unit: "0–1", defaultValue: 0.9, step: 0.01 },
    ],
    kind: "number",
    calculate: ({ current, reward, next, alpha, gamma }) =>
      current + alpha * (reward + gamma * next - current),
    interpret: (r) =>
      `The updated action value is ${formatResult(r, "number")}.`,
  },
  {
    id: "ddm-choice-probability",
    name: "Drift-diffusion choice probability",
    category: "Neuroeconomics",
    formula: "P(upper) = 1 ÷ [1 + exp(−2va ÷ s²)]",
    description:
      "Computes upper-bound choice probability for a symmetric, unbiased drift-diffusion process.",
    fields: [
      { key: "drift", label: "Evidence drift rate", short: "v", unit: "evidence/s", defaultValue: 0.35, step: 0.01 },
      { key: "boundary", label: "Boundary distance", short: "a", unit: "evidence", defaultValue: 1.2, step: 0.05 },
      { key: "noise", label: "Diffusion noise", short: "s", unit: "scale", defaultValue: 1, step: 0.05 },
    ],
    kind: "percent",
    calculate: ({ drift, boundary, noise }) =>
      sigmoid(safeDivide(2 * drift * boundary, noise ** 2)) * 100,
    interpret: (r) =>
      `Under symmetric starting conditions, the upper choice has ${formatResult(r, "percent")} probability.`,
  },
  {
    id: "ddm-mean-time",
    name: "Drift-diffusion mean decision time",
    category: "Neuroeconomics",
    formula: "E[T] = Tₑᵣ + (a ÷ v)tanh(av ÷ s²)",
    description:
      "Approximates mean response time for a symmetric unbiased diffusion process, including nondecision time.",
    fields: [
      { key: "drift", label: "Evidence drift rate", short: "v", unit: "evidence/s", defaultValue: 0.35, step: 0.01 },
      { key: "boundary", label: "Boundary distance", short: "a", unit: "evidence", defaultValue: 1.2, step: 0.05 },
      { key: "noise", label: "Diffusion noise", short: "s", unit: "scale", defaultValue: 1, step: 0.05 },
      { key: "nondecision", label: "Nondecision time", short: "Tₑᵣ", unit: "ms", defaultValue: 300 },
    ],
    kind: "seconds",
    calculate: ({ drift, boundary, noise, nondecision }) => {
      const decisionTime =
        Math.abs(drift) < 1e-9
          ? safeDivide(boundary ** 2, noise ** 2)
          : safeDivide(boundary, drift) *
            Math.tanh(safeDivide(boundary * drift, noise ** 2));
      return nondecision / 1000 + decisionTime;
    },
    interpret: (r) =>
      `The model predicts a mean response time of ${formatResult(r, "seconds")}.`,
  },
  {
    id: "reward-rate",
    name: "Expected reward rate",
    category: "Neuroeconomics",
    formula: "Reward rate = p(reward) × Magnitude ÷ (Decision time + ITI)",
    description:
      "Connects accuracy, reward magnitude, and elapsed time in speed–accuracy or foraging analyses.",
    fields: [
      { key: "probability", label: "Reward probability", short: "p", unit: "%", defaultValue: 80 },
      { key: "magnitude", label: "Reward magnitude", short: "R", unit: "value", defaultValue: 10 },
      { key: "decision", label: "Decision time", short: "DT", unit: "seconds", defaultValue: 1.1, step: 0.1 },
      { key: "interval", label: "Inter-trial interval", short: "ITI", unit: "seconds", defaultValue: 0.9, step: 0.1 },
    ],
    kind: "number",
    calculate: ({ probability, magnitude, decision, interval }) =>
      safeDivide((probability / 100) * magnitude, decision + interval),
    interpret: (r) =>
      `The task yields ${formatResult(r, "number")} expected reward units per second.`,
  },
  {
    id: "social-discounting",
    name: "Socially discounted value",
    category: "Neuroeconomics",
    formula: "v = V ÷ (1 + kN)",
    description:
      "Models how the subjective value of a reward to another person declines with social distance.",
    fields: [
      { key: "amount", label: "Reward to the other person", short: "V", unit: "$", defaultValue: 75 },
      { key: "distance", label: "Social distance", short: "N", unit: "rank", defaultValue: 10 },
      { key: "discount", label: "Social discount rate", short: "k", unit: "coefficient", defaultValue: 0.08, step: 0.01 },
    ],
    kind: "currency",
    calculate: ({ amount, distance, discount }) =>
      safeDivide(amount, 1 + discount * distance),
    interpret: (r) =>
      `At this social distance, the modeled subjective value is ${formatResult(r, "currency")}.`,
  },
  {
    id: "fehr-schmidt",
    name: "Fehr–Schmidt social utility",
    category: "Neuroeconomics",
    formula: "Uᵢ = xᵢ − α max(xⱼ − xᵢ, 0) − β max(xᵢ − xⱼ, 0)",
    description:
      "Adjusts own payoff for disadvantageous and advantageous inequity in a two-person allocation.",
    fields: [
      { key: "own", label: "Own payoff", short: "xᵢ", unit: "$", defaultValue: 40 },
      { key: "other", label: "Other person’s payoff", short: "xⱼ", unit: "$", defaultValue: 60 },
      { key: "alpha", label: "Disadvantage aversion", short: "α", unit: "coefficient", defaultValue: 0.8, step: 0.05 },
      { key: "beta", label: "Advantage aversion", short: "β", unit: "coefficient", defaultValue: 0.3, step: 0.05 },
    ],
    kind: "number",
    calculate: ({ own, other, alpha, beta }) =>
      own -
      alpha * Math.max(other - own, 0) -
      beta * Math.max(own - other, 0),
    interpret: (r) =>
      `After modeled inequity costs, own payoff carries ${formatResult(r, "number")} utility units.`,
  },
  {
    id: "bayesian-posterior",
    name: "Bayesian posterior belief",
    category: "Neuroeconomics",
    formula: "P(H|E) = P(E|H)P(H) ÷ [P(E|H)P(H) + P(E|¬H)P(¬H)]",
    description:
      "Updates a prior belief from the diagnostic strength of new evidence.",
    fields: [
      { key: "prior", label: "Prior probability", short: "P(H)", unit: "%", defaultValue: 30 },
      { key: "hit", label: "Evidence if hypothesis true", short: "P(E|H)", unit: "%", defaultValue: 85 },
      { key: "falseAlarm", label: "Evidence if hypothesis false", short: "P(E|¬H)", unit: "%", defaultValue: 20 },
    ],
    kind: "percent",
    calculate: ({ prior, hit, falseAlarm }) => {
      const p = prior / 100;
      const likelihood = hit / 100;
      const alternative = falseAlarm / 100;
      return (
        safeDivide(
          likelihood * p,
          likelihood * p + alternative * (1 - p),
        ) * 100
      );
    },
    interpret: (r) =>
      `After observing the evidence, the posterior belief is ${formatResult(r, "percent")}.`,
  },
  {
    id: "ucb-exploration",
    name: "Upper-confidence exploration value",
    category: "Neuroeconomics",
    formula: "UCB = Q + c × √(ln t ÷ n)",
    description:
      "Adds an uncertainty bonus to learned value, balancing exploitation with directed exploration.",
    fields: [
      { key: "value", label: "Estimated option value", short: "Q", unit: "value", defaultValue: 6 },
      { key: "exploration", label: "Exploration coefficient", short: "c", unit: "coefficient", defaultValue: 1.4, step: 0.1 },
      { key: "trials", label: "Total choices so far", short: "t", unit: "trials", defaultValue: 100 },
      { key: "selections", label: "Times option selected", short: "n", unit: "trials", defaultValue: 12 },
    ],
    kind: "number",
    calculate: ({ value, exploration, trials, selections }) =>
      value +
      exploration * Math.sqrt(safeDivide(Math.log(trials), selections)),
    interpret: (r) =>
      `The option’s value including its exploration bonus is ${formatResult(r, "number")}.`,
  },
  {
    id: "epsilon-greedy",
    name: "ε-greedy best-action probability",
    category: "Neuroeconomics",
    formula: "P(best) = 1 − ε + ε ÷ N",
    description:
      "Computes how often an ε-greedy policy selects the currently best-valued action.",
    fields: [
      { key: "epsilon", label: "Random exploration rate", short: "ε", unit: "%", defaultValue: 10 },
      { key: "actions", label: "Available actions", short: "N", unit: "actions", defaultValue: 4 },
    ],
    kind: "percent",
    calculate: ({ epsilon, actions }) =>
      (1 - epsilon / 100 + safeDivide(epsilon / 100, actions)) * 100,
    interpret: (r) =>
      `The current best action is selected on ${formatResult(r, "percent")} of choices.`,
  },
  {
    id: "choice-entropy",
    name: "Binary choice entropy",
    category: "Neuroeconomics",
    formula: "H = −p log₂p − (1 − p)log₂(1 − p)",
    description:
      "Measures unpredictability in a binary choice distribution, from 0 bits (certain) to 1 bit (maximally uncertain).",
    fields: [
      { key: "probability", label: "Probability of option A", short: "p", unit: "%", defaultValue: 70 },
    ],
    kind: "number",
    calculate: ({ probability }) => {
      const p = probability / 100;
      if (p < 0 || p > 1) return Number.NaN;
      if (p === 0 || p === 1) return 0;
      return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
    },
    interpret: (r) =>
      `Choice uncertainty is ${formatResult(r, "number")} bits out of a 1-bit maximum.`,
  },
];

const bridgeFormulas: Formula[] = [
  {
    id: "linear-market-equilibrium",
    name: "Linear market equilibrium",
    category: "Master’s micro theory",
    formula: "QD(P*) = QS(P*)",
    description: "Solves equilibrium price and quantity for linear demand QD = a − bP and supply QS = c + dP.",
    fields: [
      { key: "a", label: "Demand intercept", short: "a", unit: "units", defaultValue: 120 },
      { key: "b", label: "Demand slope", short: "b", unit: "slope", defaultValue: 2 },
      { key: "c", label: "Supply intercept", short: "c", unit: "units", defaultValue: 20 },
      { key: "d", label: "Supply slope", short: "d", unit: "slope", defaultValue: 3 },
    ],
    kind: "currency",
    calculate: ({ a, b, c, d }) => safeDivide(a - c, b + d),
    display: (price, { a, b }) => `P* = ${formatResult(price, "currency")} · Q* = ${formatResult(a - b * price, "quantity")}`,
    interpret: (price, { a, b }) => `Demand equals supply at price ${formatResult(price, "currency")} and quantity ${formatResult(a - b * price, "quantity")}.`,
  },
  {
    id: "point-elasticity",
    name: "Point elasticity",
    category: "Master’s micro theory",
    formula: "εQ,P = (dQ/dP) × (P/Q)",
    description: "Calculates elasticity at one point on a demand or supply curve.",
    fields: [
      { key: "derivative", label: "Quantity derivative", short: "dQ/dP", unit: "slope", defaultValue: -2 },
      { key: "price", label: "Price at point", short: "P", unit: "$", defaultValue: 30 },
      { key: "quantity", label: "Quantity at point", short: "Q", unit: "units", defaultValue: 60 },
    ],
    kind: "number",
    calculate: ({ derivative, price, quantity }) => derivative * safeDivide(price, quantity),
    interpret: (r) => `A 1% price change is associated locally with an approximately ${formatResult(Math.abs(r), "percent")} quantity response in magnitude.`,
  },
  {
    id: "arc-elasticity",
    name: "Arc elasticity (midpoint)",
    category: "Master’s micro theory",
    formula: "εarc = (ΔQ/Q̄) ÷ (ΔP/P̄)",
    description: "Measures elasticity between two observations using midpoint denominators.",
    fields: [
      { key: "q0", label: "Initial quantity", short: "Q₀", unit: "units", defaultValue: 80 },
      { key: "q1", label: "New quantity", short: "Q₁", unit: "units", defaultValue: 68 },
      { key: "p0", label: "Initial price", short: "P₀", unit: "$", defaultValue: 20 },
      { key: "p1", label: "New price", short: "P₁", unit: "$", defaultValue: 24 },
    ],
    kind: "number",
    calculate: ({ q0, q1, p0, p1 }) =>
      safeDivide(safeDivide(q1 - q0, (q1 + q0) / 2), safeDivide(p1 - p0, (p1 + p0) / 2)),
    interpret: (r) => `The midpoint elasticity is ${formatResult(r, "number")}; magnitude above one indicates an elastic response.`,
  },
  {
    id: "tax-wedge",
    name: "Tax wedge",
    category: "Master’s micro theory",
    formula: "Pb − Ps = t",
    description: "Measures the per-unit gap between the buyer price and seller receipt.",
    fields: [
      { key: "buyer", label: "Price paid by buyer", short: "Pb", unit: "$", defaultValue: 52 },
      { key: "seller", label: "Price received by seller", short: "Ps", unit: "$", defaultValue: 45 },
    ],
    kind: "currency",
    calculate: ({ buyer, seller }) => buyer - seller,
    interpret: (r) => `The implied per-unit tax wedge is ${formatResult(r, "currency")}.`,
  },
  {
    id: "taxed-linear-equilibrium",
    name: "Taxed-market equilibrium",
    category: "Master’s micro theory",
    formula: "QD(Pb) = QS(Ps), with Pb − Ps = t",
    description: "Solves a linear market after a per-unit tax using QD = a − bPb and QS = c + dPs.",
    fields: [
      { key: "a", label: "Demand intercept", short: "a", unit: "units", defaultValue: 120 },
      { key: "b", label: "Demand slope", short: "b", unit: "slope", defaultValue: 2 },
      { key: "c", label: "Supply intercept", short: "c", unit: "units", defaultValue: 20 },
      { key: "d", label: "Supply slope", short: "d", unit: "slope", defaultValue: 3 },
      { key: "tax", label: "Tax per unit", short: "t", unit: "$", defaultValue: 10 },
    ],
    kind: "currency",
    calculate: ({ a, b, c, d, tax }) => safeDivide(a - c + d * tax, b + d),
    display: (buyer, { a, b, tax }) =>
      `Pb = ${formatResult(buyer, "currency")} · Ps = ${formatResult(buyer - tax, "currency")} · Q = ${formatResult(a - b * buyer, "quantity")}`,
    interpret: (buyer, { a, b, tax }) => `The tax separates buyer and seller prices by ${formatResult(tax, "currency")} and leaves ${formatResult(a - b * buyer, "quantity")} traded.`,
  },
  {
    id: "multi-period-present-value",
    name: "Multi-period present value",
    category: "Finance & investment",
    formula: "PV = Σt Xt/(1+r)ᵗ",
    description: "Discounts a current amount and three future cash flows to time zero.",
    fields: [
      { key: "x0", label: "Cash flow at t=0", short: "X₀", unit: "$", defaultValue: -5000 },
      { key: "x1", label: "Cash flow at t=1", short: "X₁", unit: "$", defaultValue: 2000 },
      { key: "x2", label: "Cash flow at t=2", short: "X₂", unit: "$", defaultValue: 2200 },
      { key: "x3", label: "Cash flow at t=3", short: "X₃", unit: "$", defaultValue: 2400 },
      { key: "rate", label: "Discount rate", short: "r", unit: "%", defaultValue: 8 },
    ],
    kind: "currency",
    calculate: ({ x0, x1, x2, x3, rate }) => {
      const factor = 1 + rate / 100;
      return x0 + x1 / factor + x2 / factor ** 2 + x3 / factor ** 3;
    },
    interpret: (r) => `The time-zero value of the cash-flow stream is ${formatResult(r, "currency")}.`,
  },
  {
    id: "budget-constraint",
    name: "Budget constraint",
    category: "Master’s micro theory",
    formula: "pxx + pyy = m",
    description: "Solves the maximum affordable quantity of y after choosing x.",
    fields: [
      { key: "px", label: "Price of x", short: "px", unit: "$", defaultValue: 12 },
      { key: "x", label: "Quantity of x", short: "x", unit: "units", defaultValue: 8 },
      { key: "py", label: "Price of y", short: "py", unit: "$", defaultValue: 6 },
      { key: "income", label: "Income", short: "m", unit: "$", defaultValue: 180 },
    ],
    kind: "quantity",
    calculate: ({ px, x, py, income }) => safeDivide(income - px * x, py),
    interpret: (r) => `After buying x, the boundary of the budget set permits ${formatResult(r, "quantity")} of y.`,
  },
  {
    id: "marginal-rate-substitution",
    name: "Marginal rate of substitution",
    category: "Master’s micro theory",
    formula: "MRSxy = MUx/MUy",
    description: "Measures willingness to exchange y for one additional unit of x.",
    fields: [
      { key: "mux", label: "Marginal utility of x", short: "MUx", unit: "utility", defaultValue: 18 },
      { key: "muy", label: "Marginal utility of y", short: "MUy", unit: "utility", defaultValue: 9 },
    ],
    kind: "rate",
    calculate: ({ mux, muy }) => safeDivide(mux, muy),
    interpret: (r) => `At the current bundle, one unit of x is valued like ${formatResult(r, "rate")} units of y.`,
  },
  {
    id: "consumer-optimum-gap",
    name: "Consumer optimum condition",
    category: "Master’s micro theory",
    formula: "MRSxy = px/py",
    description: "Checks the interior optimum by comparing willingness to trade with the market price ratio.",
    fields: [
      { key: "mux", label: "Marginal utility of x", short: "MUx", unit: "utility", defaultValue: 18 },
      { key: "muy", label: "Marginal utility of y", short: "MUy", unit: "utility", defaultValue: 9 },
      { key: "px", label: "Price of x", short: "px", unit: "$", defaultValue: 12 },
      { key: "py", label: "Price of y", short: "py", unit: "$", defaultValue: 6 },
    ],
    kind: "number",
    calculate: ({ mux, muy, px, py }) => safeDivide(mux, muy) - safeDivide(px, py),
    interpret: (r) => Math.abs(r) < 0.001 ? "The interior optimum condition is satisfied." : `The condition has a gap of ${formatResult(r, "number")}; reallocation can improve utility under standard assumptions.`,
  },
  {
    id: "roys-identity",
    name: "Roy’s identity",
    category: "Master’s micro theory",
    formula: "xi(p,m) = −vpᵢ(p,m)/vm(p,m)",
    description: "Recovers Marshallian demand from derivatives of the indirect utility function.",
    fields: [
      { key: "priceDerivative", label: "Indirect utility price derivative", short: "vpᵢ", unit: "derivative", defaultValue: -16 },
      { key: "incomeDerivative", label: "Indirect utility income derivative", short: "vm", unit: "derivative", defaultValue: 2 },
    ],
    kind: "quantity",
    calculate: ({ priceDerivative, incomeDerivative }) => -safeDivide(priceDerivative, incomeDerivative),
    interpret: (r) => `Roy’s identity implies Marshallian demand of ${formatResult(r, "quantity")}.`,
  },
  {
    id: "shephards-lemma",
    name: "Shephard’s lemma",
    category: "Master’s micro theory",
    formula: "hi(p,u) = ∂e(p,u)/∂pi",
    description: "Reads Hicksian demand from the price derivative of the expenditure function.",
    fields: [
      { key: "derivative", label: "Expenditure price derivative", short: "∂e/∂pi", unit: "derivative", defaultValue: 12 },
    ],
    kind: "quantity",
    calculate: ({ derivative }) => derivative,
    interpret: (r) => `Compensated demand is ${formatResult(r, "quantity")} at the evaluated price and utility.`,
  },
  {
    id: "slutsky-equation",
    name: "Slutsky equation",
    category: "Master’s micro theory",
    formula: "∂xi/∂pj = ∂hi/∂pj − xj(∂xi/∂m)",
    description: "Combines substitution and income effects into the uncompensated price response.",
    fields: [
      { key: "substitution", label: "Compensated price effect", short: "∂hi/∂pj", unit: "derivative", defaultValue: -0.8 },
      { key: "quantityJ", label: "Quantity of good j", short: "xj", unit: "units", defaultValue: 5 },
      { key: "incomeEffect", label: "Income derivative", short: "∂xi/∂m", unit: "derivative", defaultValue: 0.06 },
    ],
    kind: "number",
    calculate: ({ substitution, quantityJ, incomeEffect }) => substitution - quantityJ * incomeEffect,
    interpret: (r) => `The Marshallian price derivative is ${formatResult(r, "number")}.`,
  },
  {
    id: "mrts",
    name: "Marginal rate of technical substitution",
    category: "Master’s micro theory",
    formula: "MRTS = MPL/MPK = w/r",
    description: "Measures the rate at which labor substitutes for capital along an isoquant.",
    fields: [
      { key: "mpl", label: "Marginal product of labor", short: "MPL", unit: "output", defaultValue: 24 },
      { key: "mpk", label: "Marginal product of capital", short: "MPK", unit: "output", defaultValue: 12 },
    ],
    kind: "rate",
    calculate: ({ mpl, mpk }) => safeDivide(mpl, mpk),
    interpret: (r) => `Technology permits substitution at ${formatResult(r, "rate")} units of capital per unit of labor.`,
  },
  {
    id: "competitive-profit-condition",
    name: "Competitive profit condition",
    category: "Master’s micro theory",
    formula: "p = MC",
    description: "Checks the price–marginal-cost first-order condition for a competitive firm.",
    fields: [
      { key: "price", label: "Output price", short: "p", unit: "$", defaultValue: 42 },
      { key: "mc", label: "Marginal cost", short: "MC", unit: "$", defaultValue: 39 },
    ],
    kind: "currency",
    calculate: ({ price, mc }) => price - mc,
    interpret: (r) => Math.abs(r) < 0.001 ? "Price equals marginal cost at the evaluated output." : `Price minus marginal cost is ${formatResult(r, "currency")}; the standard interior condition is not yet met.`,
  },
  {
    id: "monopoly-profit-condition",
    name: "Monopoly profit condition",
    category: "Master’s micro theory",
    formula: "MR = MC",
    description: "Checks the marginal-revenue–marginal-cost condition for monopoly output.",
    fields: [
      { key: "mr", label: "Marginal revenue", short: "MR", unit: "$", defaultValue: 36 },
      { key: "mc", label: "Marginal cost", short: "MC", unit: "$", defaultValue: 31 },
    ],
    kind: "currency",
    calculate: ({ mr, mc }) => mr - mc,
    interpret: (r) => Math.abs(r) < 0.001 ? "Marginal revenue equals marginal cost." : `MR − MC is ${formatResult(r, "currency")}; output would adjust under the standard model.`,
  },
  {
    id: "lerner-index",
    name: "Lerner index",
    category: "Master’s micro theory",
    formula: "L = (P − MC)/P = −1/ε",
    description: "Measures a firm’s price markup over marginal cost as a share of price.",
    fields: [
      { key: "price", label: "Price", short: "P", unit: "$", defaultValue: 50 },
      { key: "mc", label: "Marginal cost", short: "MC", unit: "$", defaultValue: 35 },
    ],
    kind: "percent",
    calculate: ({ price, mc }) => safeDivide(price - mc, price) * 100,
    interpret: (r) => `The markup is ${formatResult(r, "percent")} of price.`,
  },
  {
    id: "risk-premium-approximation",
    name: "Arrow–Pratt risk-premium approximation",
    category: "Master’s micro theory",
    formula: "RP ≈ ½A(c)Var(ε)",
    description: "Approximates the risk premium for a small zero-mean risk using absolute risk aversion.",
    fields: [
      { key: "aversion", label: "Absolute risk aversion", short: "A(c)", unit: "coefficient", defaultValue: 0.04, step: 0.01 },
      { key: "variance", label: "Risk variance", short: "Var(ε)", unit: "variance", defaultValue: 400 },
    ],
    kind: "currency",
    calculate: ({ aversion, variance }) => 0.5 * aversion * variance,
    interpret: (r) => `The local approximation gives a risk premium of ${formatResult(r, "currency")}.`,
  },
  {
    id: "nash-best-response",
    name: "Nash best-response check",
    category: "Master’s micro theory",
    formula: "si* ∈ arg maxsi ui(si,s−i*)",
    description: "Checks whether a chosen strategy weakly beats one alternative against the opponents’ fixed strategies.",
    fields: [
      { key: "chosen", label: "Payoff from chosen strategy", short: "u(si*)", unit: "payoff", defaultValue: 8 },
      { key: "alternative", label: "Best alternative payoff", short: "max u(si)", unit: "payoff", defaultValue: 6 },
    ],
    kind: "number",
    calculate: ({ chosen, alternative }) => chosen - alternative,
    interpret: (r) => r >= 0 ? `The chosen strategy is a best response with margin ${formatResult(r, "number")}.` : `A deviation improves payoff by ${formatResult(Math.abs(r), "number")}; this strategy profile is not Nash for this player.`,
  },
  {
    id: "symmetric-cournot",
    name: "Symmetric Cournot quantity",
    category: "Master’s micro theory",
    formula: "qi* = (a − c)/[b(n + 1)] for P(Q)=a−bQ",
    description: "Solves each firm’s quantity in a symmetric linear-demand Cournot equilibrium with constant marginal cost.",
    fields: [
      { key: "a", label: "Demand intercept", short: "a", unit: "$", defaultValue: 100 },
      { key: "b", label: "Demand slope", short: "b", unit: "slope", defaultValue: 1 },
      { key: "cost", label: "Marginal cost", short: "c", unit: "$", defaultValue: 20 },
      { key: "firms", label: "Number of firms", short: "n", unit: "firms", defaultValue: 2 },
    ],
    kind: "quantity",
    calculate: ({ a, b, cost, firms }) => safeDivide(a - cost, b * (firms + 1)),
    interpret: (r) => `Each symmetric firm produces ${formatResult(r, "quantity")}.`,
  },
  {
    id: "wald-estimator",
    name: "Wald / just-identified 2SLS estimator",
    category: "Econometrics & statistics",
    formula: "βWald = [E(Y|Z=1)−E(Y|Z=0)]/[E(D|Z=1)−E(D|Z=0)]",
    description: "Estimates a causal effect using a binary instrument’s reduced-form and first-stage differences.",
    fields: [
      { key: "y1", label: "Mean outcome when Z=1", short: "E[Y|Z=1]", unit: "outcome", defaultValue: 72 },
      { key: "y0", label: "Mean outcome when Z=0", short: "E[Y|Z=0]", unit: "outcome", defaultValue: 64 },
      { key: "d1", label: "Mean treatment when Z=1", short: "E[D|Z=1]", unit: "rate", defaultValue: 0.7 },
      { key: "d0", label: "Mean treatment when Z=0", short: "E[D|Z=0]", unit: "rate", defaultValue: 0.3 },
    ],
    kind: "number",
    calculate: ({ y1, y0, d1, d0 }) => safeDivide(y1 - y0, d1 - d0),
    interpret: (r) => `The Wald/just-identified IV estimate is ${formatResult(r, "number")}.`,
  },
  {
    id: "fisher-approximation",
    name: "Fisher approximation",
    category: "Advanced macroeconomics",
    formula: "r ≈ i − πᵉ",
    description: "Approximates the real interest rate by subtracting expected inflation from the nominal rate.",
    fields: [
      { key: "nominal", label: "Nominal interest rate", short: "i", unit: "%", defaultValue: 7 },
      { key: "inflation", label: "Expected inflation", short: "πᵉ", unit: "%", defaultValue: 3 },
    ],
    kind: "percent",
    calculate: ({ nominal, inflation }) => nominal - inflation,
    interpret: (r) => `The approximate expected real interest rate is ${formatResult(r, "percent")}.`,
  },
  {
    id: "solow-capital-change",
    name: "Solow capital accumulation",
    category: "Advanced macroeconomics",
    formula: "k̇ = sAkᵅ − (n + g + δ)k",
    description: "Calculates capital deepening in a Cobb–Douglas Solow model.",
    fields: [
      { key: "capital", label: "Capital per effective worker", short: "k", unit: "capital", defaultValue: 10 },
      { key: "productivity", label: "Productivity", short: "A", unit: "scale", defaultValue: 2 },
      { key: "alpha", label: "Capital elasticity", short: "α", unit: "coefficient", defaultValue: 0.33, step: 0.01 },
      { key: "saving", label: "Saving rate", short: "s", unit: "%", defaultValue: 25 },
      { key: "population", label: "Population growth", short: "n", unit: "%", defaultValue: 1 },
      { key: "technology", label: "Technology growth", short: "g", unit: "%", defaultValue: 2 },
      { key: "depreciation", label: "Depreciation", short: "δ", unit: "%", defaultValue: 5 },
    ],
    kind: "number",
    calculate: ({ capital, productivity, alpha, saving, population, technology, depreciation }) =>
      (saving / 100) * productivity * capital ** alpha -
      ((population + technology + depreciation) / 100) * capital,
    interpret: (r) => r >= 0 ? `Capital per effective worker rises by ${formatResult(r, "number")} per period.` : `Capital per effective worker falls by ${formatResult(Math.abs(r), "number")} per period.`,
  },
  {
    id: "solow-steady-state-gap",
    name: "Solow steady-state gap",
    category: "Advanced macroeconomics",
    formula: "Gap = sf(k) − (n + g + δ)k",
    description: "Checks whether current capital lies at the Solow steady state.",
    fields: [
      { key: "output", label: "Output per effective worker", short: "f(k)", unit: "output", defaultValue: 4.3 },
      { key: "saving", label: "Saving rate", short: "s", unit: "%", defaultValue: 25 },
      { key: "capital", label: "Capital per effective worker", short: "k", unit: "capital", defaultValue: 10 },
      { key: "breakEven", label: "n + g + δ", short: "n+g+δ", unit: "%", defaultValue: 8 },
    ],
    kind: "number",
    calculate: ({ output, saving, capital, breakEven }) => (saving / 100) * output - (breakEven / 100) * capital,
    interpret: (r) => Math.abs(r) < 0.001 ? "Saving-funded investment exactly covers break-even investment." : `Net investment is ${formatResult(r, "number")}; zero marks the steady state.`,
  },
  {
    id: "golden-rule-gap",
    name: "Golden-rule capital condition",
    category: "Advanced macroeconomics",
    formula: "f′(kGR) = n + g + δ",
    description: "Checks the consumption-maximizing capital condition by comparing net marginal product with break-even growth.",
    fields: [
      { key: "mpk", label: "Marginal product of capital", short: "f′(k)", unit: "%", defaultValue: 9 },
      { key: "population", label: "Population growth", short: "n", unit: "%", defaultValue: 1 },
      { key: "technology", label: "Technology growth", short: "g", unit: "%", defaultValue: 2 },
      { key: "depreciation", label: "Depreciation", short: "δ", unit: "%", defaultValue: 5 },
    ],
    kind: "percent",
    calculate: ({ mpk, population, technology, depreciation }) => mpk - population - technology - depreciation,
    interpret: (r) => Math.abs(r) < 0.001 ? "The Golden Rule condition is satisfied." : `The marginal-product gap is ${formatResult(r, "percent")}; zero marks Golden Rule capital.`,
  },
  {
    id: "euler-equation-gap",
    name: "Consumption Euler equation",
    category: "Advanced macroeconomics",
    formula: "u′(ct) = βEt[(1+rt+1)u′(ct+1)]",
    description: "Checks intertemporal optimality using current and expected future marginal utility.",
    fields: [
      { key: "currentMU", label: "Current marginal utility", short: "u′(ct)", unit: "utility", defaultValue: 1.1 },
      { key: "futureMU", label: "Expected future marginal utility", short: "E[u′(ct+1)]", unit: "utility", defaultValue: 1 },
      { key: "beta", label: "Subjective discount factor", short: "β", unit: "0–1", defaultValue: 0.96, step: 0.01 },
      { key: "rate", label: "Real interest rate", short: "r", unit: "%", defaultValue: 4 },
    ],
    kind: "number",
    calculate: ({ currentMU, futureMU, beta, rate }) => currentMU - beta * (1 + rate / 100) * futureMU,
    interpret: (r) => Math.abs(r) < 0.001 ? "The Euler condition is satisfied." : `The marginal-utility gap is ${formatResult(r, "number")}; zero marks the interior optimum.`,
  },
  {
    id: "new-keynesian-is",
    name: "New Keynesian IS curve",
    category: "Advanced macroeconomics",
    formula: "xt = Etxt+1 − (1/σ)(it − Etπt+1 − rtn)",
    description: "Computes the current output gap from expected activity and the real-rate gap.",
    fields: [
      { key: "futureGap", label: "Expected next output gap", short: "Etxt+1", unit: "%", defaultValue: 1.2 },
      { key: "sigma", label: "Intertemporal elasticity inverse", short: "σ", unit: "coefficient", defaultValue: 1.5, step: 0.1 },
      { key: "nominal", label: "Nominal policy rate", short: "it", unit: "%", defaultValue: 5 },
      { key: "inflation", label: "Expected inflation", short: "Etπt+1", unit: "%", defaultValue: 2.5 },
      { key: "natural", label: "Natural real rate", short: "rtn", unit: "%", defaultValue: 1.5 },
    ],
    kind: "percent",
    calculate: ({ futureGap, sigma, nominal, inflation, natural }) => futureGap - safeDivide(nominal - inflation - natural, sigma),
    interpret: (r) => `The implied current output gap is ${formatResult(r, "percent")}.`,
  },
  {
    id: "new-keynesian-phillips",
    name: "New Keynesian Phillips curve",
    category: "Advanced macroeconomics",
    formula: "πt = βEtπt+1 + κxt + ut",
    description: "Computes inflation from expected inflation, the output gap, and a cost-push shock.",
    fields: [
      { key: "beta", label: "Discount factor", short: "β", unit: "0–1", defaultValue: 0.99, step: 0.01 },
      { key: "expectedInflation", label: "Expected next inflation", short: "Etπt+1", unit: "%", defaultValue: 2.2 },
      { key: "kappa", label: "Phillips slope", short: "κ", unit: "coefficient", defaultValue: 0.2, step: 0.01 },
      { key: "gap", label: "Output gap", short: "xt", unit: "%", defaultValue: 1.5 },
      { key: "shock", label: "Cost-push shock", short: "ut", unit: "%", defaultValue: 0.1 },
    ],
    kind: "percent",
    calculate: ({ beta, expectedInflation, kappa, gap, shock }) => beta * expectedInflation + kappa * gap + shock,
    interpret: (r) => `The Phillips curve implies inflation of ${formatResult(r, "percent")}.`,
  },
  {
    id: "debt-dynamics",
    name: "Debt-ratio dynamics",
    category: "Advanced macroeconomics",
    formula: "Δb ≈ (r − g)b − Primary-surplus ratio",
    description: "Approximates the change in the public debt-to-GDP ratio.",
    fields: [
      { key: "realRate", label: "Real interest rate", short: "r", unit: "%", defaultValue: 4 },
      { key: "growth", label: "Real GDP growth", short: "g", unit: "%", defaultValue: 2.5 },
      { key: "debt", label: "Debt-to-GDP ratio", short: "b", unit: "%", defaultValue: 90 },
      { key: "surplus", label: "Primary-surplus ratio", short: "s", unit: "% GDP", defaultValue: 1 },
    ],
    kind: "percent",
    calculate: ({ realRate, growth, debt, surplus }) => ((realRate - growth) / 100) * debt - surplus,
    interpret: (r) => r >= 0 ? `The debt ratio rises by approximately ${formatResult(r, "percent")} of GDP.` : `The debt ratio falls by approximately ${formatResult(Math.abs(r), "percent")} of GDP.`,
  },
  {
    id: "current-account",
    name: "Current account balance",
    category: "Advanced macroeconomics",
    formula: "CA = S − I",
    description: "Computes net lending to the rest of the world from national saving and investment.",
    fields: [
      { key: "saving", label: "National saving", short: "S", unit: "$", defaultValue: 3200 },
      { key: "investment", label: "Domestic investment", short: "I", unit: "$", defaultValue: 2900 },
    ],
    kind: "currency",
    calculate: ({ saving, investment }) => saving - investment,
    interpret: (r) => r >= 0 ? `The economy runs a current-account surplus of ${formatResult(r, "currency")}.` : `The economy runs a current-account deficit of ${formatResult(Math.abs(r), "currency")}.`,
  },
  {
    id: "discrete-transformed-expectation",
    name: "Discrete transformed expectation",
    category: "Econometrics & statistics",
    formula: "E[g(X)] = Σx g(x)P(X=x)",
    description: "Computes the expectation of a three-state transformed random variable.",
    fields: [
      { key: "g1", label: "Transformed value 1", short: "g(x₁)", unit: "value", defaultValue: 2 },
      { key: "g2", label: "Transformed value 2", short: "g(x₂)", unit: "value", defaultValue: 6 },
      { key: "g3", label: "Transformed value 3", short: "g(x₃)", unit: "value", defaultValue: 10 },
      { key: "p1", label: "Probability 1", short: "p₁", unit: "%", defaultValue: 20 },
      { key: "p2", label: "Probability 2", short: "p₂", unit: "%", defaultValue: 50 },
      { key: "p3", label: "Probability 3", short: "p₃", unit: "%", defaultValue: 30 },
    ],
    kind: "number",
    calculate: ({ g1, g2, g3, p1, p2, p3 }) => (g1 * p1 + g2 * p2 + g3 * p3) / 100,
    interpret: (r, { p1, p2, p3 }) => `The transformed expectation is ${formatResult(r, "number")}; entered probabilities sum to ${formatResult(p1 + p2 + p3, "percent")}.`,
  },
  {
    id: "discrete-variance",
    name: "Discrete variance",
    category: "Econometrics & statistics",
    formula: "Var(X) = E[X²] − E[X]²",
    description: "Computes variance for a three-state discrete distribution.",
    fields: [
      { key: "x1", label: "Outcome 1", short: "x₁", unit: "value", defaultValue: 2 },
      { key: "x2", label: "Outcome 2", short: "x₂", unit: "value", defaultValue: 6 },
      { key: "x3", label: "Outcome 3", short: "x₃", unit: "value", defaultValue: 10 },
      { key: "p1", label: "Probability 1", short: "p₁", unit: "%", defaultValue: 20 },
      { key: "p2", label: "Probability 2", short: "p₂", unit: "%", defaultValue: 50 },
      { key: "p3", label: "Probability 3", short: "p₃", unit: "%", defaultValue: 30 },
    ],
    kind: "number",
    calculate: ({ x1, x2, x3, p1, p2, p3 }) => {
      const mean = (x1 * p1 + x2 * p2 + x3 * p3) / 100;
      return (x1 ** 2 * p1 + x2 ** 2 * p2 + x3 ** 2 * p3) / 100 - mean ** 2;
    },
    interpret: (r) => `The distribution has variance ${formatResult(r, "number")}.`,
  },
  {
    id: "sample-covariance",
    name: "Covariance",
    category: "Econometrics & statistics",
    formula: "Cov(X,Y) = E[(X−EX)(Y−EY)]",
    description: "Computes population covariance from four equally weighted paired observations.",
    fields: [
      { key: "x1", label: "X observation 1", short: "x₁", unit: "value", defaultValue: 1 },
      { key: "y1", label: "Y observation 1", short: "y₁", unit: "value", defaultValue: 3 },
      { key: "x2", label: "X observation 2", short: "x₂", unit: "value", defaultValue: 2 },
      { key: "y2", label: "Y observation 2", short: "y₂", unit: "value", defaultValue: 5 },
      { key: "x3", label: "X observation 3", short: "x₃", unit: "value", defaultValue: 4 },
      { key: "y3", label: "Y observation 3", short: "y₃", unit: "value", defaultValue: 8 },
      { key: "x4", label: "X observation 4", short: "x₄", unit: "value", defaultValue: 5 },
      { key: "y4", label: "Y observation 4", short: "y₄", unit: "value", defaultValue: 11 },
    ],
    kind: "number",
    calculate: ({ x1, y1, x2, y2, x3, y3, x4, y4 }) => {
      const mx = (x1 + x2 + x3 + x4) / 4;
      const my = (y1 + y2 + y3 + y4) / 4;
      return ((x1 - mx) * (y1 - my) + (x2 - mx) * (y2 - my) + (x3 - mx) * (y3 - my) + (x4 - mx) * (y4 - my)) / 4;
    },
    interpret: (r) => r >= 0 ? `Covariance is ${formatResult(r, "number")}, indicating positive co-movement.` : `Covariance is ${formatResult(r, "number")}, indicating negative co-movement.`,
  },
  {
    id: "variance-independent-mean",
    name: "Variance of an independent mean",
    category: "Econometrics & statistics",
    formula: "Var(X̄) = σ²/n",
    description: "Calculates the sampling variance of a mean under independent, identically distributed observations.",
    fields: [
      { key: "variance", label: "Population variance", short: "σ²", unit: "variance", defaultValue: 144 },
      { key: "size", label: "Sample size", short: "n", unit: "observations", defaultValue: 36 },
    ],
    kind: "number",
    calculate: ({ variance, size }) => safeDivide(variance, size),
    interpret: (r) => `The sample mean has variance ${formatResult(r, "number")} and standard error ${formatResult(Math.sqrt(r), "number")}.`,
  },
  {
    id: "confidence-interval",
    name: "Confidence interval",
    category: "Econometrics & statistics",
    formula: "θ̂ ± cαSE(θ̂)",
    description: "Constructs a symmetric confidence interval from an estimate, standard error, and critical value.",
    fields: [
      { key: "estimate", label: "Point estimate", short: "θ̂", unit: "value", defaultValue: 2.4 },
      { key: "critical", label: "Critical value", short: "cα", unit: "coefficient", defaultValue: 1.96, step: 0.01 },
      { key: "se", label: "Standard error", short: "SE", unit: "value", defaultValue: 0.5 },
    ],
    kind: "number",
    calculate: ({ critical, se }) => critical * se,
    display: (margin, { estimate }) => `[${formatResult(estimate - margin, "number")}, ${formatResult(estimate + margin, "number")}]`,
    interpret: (margin, { estimate }) => `The interval runs from ${formatResult(estimate - margin, "number")} to ${formatResult(estimate + margin, "number")}.`,
  },
  {
    id: "simple-ols",
    name: "OLS estimator (simple regression)",
    category: "Econometrics & statistics",
    formula: "β̂=(XᵀX)⁻¹Xᵀy; simple slope = Cov(X,Y)/Var(X)",
    description: "Fits an intercept and slope to four observations, the two-parameter version of matrix OLS.",
    fields: [
      { key: "x1", label: "X observation 1", short: "x₁", unit: "value", defaultValue: 1 },
      { key: "y1", label: "Y observation 1", short: "y₁", unit: "value", defaultValue: 2 },
      { key: "x2", label: "X observation 2", short: "x₂", unit: "value", defaultValue: 2 },
      { key: "y2", label: "Y observation 2", short: "y₂", unit: "value", defaultValue: 4 },
      { key: "x3", label: "X observation 3", short: "x₃", unit: "value", defaultValue: 3 },
      { key: "y3", label: "Y observation 3", short: "y₃", unit: "value", defaultValue: 5 },
      { key: "x4", label: "X observation 4", short: "x₄", unit: "value", defaultValue: 4 },
      { key: "y4", label: "Y observation 4", short: "y₄", unit: "value", defaultValue: 8 },
    ],
    kind: "number",
    calculate: ({ x1, y1, x2, y2, x3, y3, x4, y4 }) => {
      const mx = (x1 + x2 + x3 + x4) / 4;
      const my = (y1 + y2 + y3 + y4) / 4;
      return safeDivide((x1 - mx) * (y1 - my) + (x2 - mx) * (y2 - my) + (x3 - mx) * (y3 - my) + (x4 - mx) * (y4 - my), (x1 - mx) ** 2 + (x2 - mx) ** 2 + (x3 - mx) ** 2 + (x4 - mx) ** 2);
    },
    display: (slope, { x1, y1, x2, y2, x3, y3, x4, y4 }) => {
      const intercept = (y1 + y2 + y3 + y4) / 4 - slope * ((x1 + x2 + x3 + x4) / 4);
      return `β̂₀ = ${formatResult(intercept, "number")} · β̂₁ = ${formatResult(slope, "number")}`;
    },
    interpret: (slope, { x1, y1, x2, y2, x3, y3, x4, y4 }) => {
      const intercept = (y1 + y2 + y3 + y4) / 4 - slope * ((x1 + x2 + x3 + x4) / 4);
      return `The fitted line is ŷ = ${formatResult(intercept, "number")} + ${formatResult(slope, "number")}x.`;
    },
  },
  {
    id: "normal-equation-moment",
    name: "Normal-equation orthogonality check",
    category: "Econometrics & statistics",
    formula: "Xᵀ(y − Xβ̂) = 0",
    description: "Calculates one regressor’s residual moment; zero is the OLS normal-equation condition.",
    fields: [
      { key: "x1", label: "Regressor value 1", short: "x₁", unit: "value", defaultValue: 1 },
      { key: "r1", label: "Residual 1", short: "e₁", unit: "value", defaultValue: -0.2 },
      { key: "x2", label: "Regressor value 2", short: "x₂", unit: "value", defaultValue: 2 },
      { key: "r2", label: "Residual 2", short: "e₂", unit: "value", defaultValue: 0.1 },
      { key: "x3", label: "Regressor value 3", short: "x₃", unit: "value", defaultValue: 3 },
      { key: "r3", label: "Residual 3", short: "e₃", unit: "value", defaultValue: 0 },
    ],
    kind: "number",
    calculate: ({ x1, r1, x2, r2, x3, r3 }) => x1 * r1 + x2 * r2 + x3 * r3,
    interpret: (r) => Math.abs(r) < 0.001 ? "The entered residuals are orthogonal to this regressor." : `The residual moment is ${formatResult(r, "number")}; OLS orthogonality is not satisfied.`,
  },
  {
    id: "omitted-variable-bias",
    name: "Omitted-variable bias",
    category: "Econometrics & statistics",
    formula: "plim β̂X = βX + βZ Cov(X,Z)/Var(X)",
    description: "Computes the probability limit of a coefficient when a relevant correlated regressor is omitted.",
    fields: [
      { key: "betaX", label: "True coefficient on X", short: "βX", unit: "coefficient", defaultValue: 2 },
      { key: "betaZ", label: "True coefficient on omitted Z", short: "βZ", unit: "coefficient", defaultValue: 3 },
      { key: "covariance", label: "Covariance of X and Z", short: "Cov(X,Z)", unit: "covariance", defaultValue: 4 },
      { key: "variance", label: "Variance of X", short: "Var(X)", unit: "variance", defaultValue: 8 },
    ],
    kind: "number",
    calculate: ({ betaX, betaZ, covariance, variance }) => betaX + betaZ * safeDivide(covariance, variance),
    interpret: (r, { betaX }) => `The misspecified coefficient converges to ${formatResult(r, "number")}, a bias of ${formatResult(r - betaX, "number")}.`,
  },
  {
    id: "projection-matrix-leverage",
    name: "Projection matrix leverage",
    category: "Econometrics & statistics",
    formula: "PZ = Z(ZᵀZ)⁻¹Zᵀ",
    description: "Computes the first diagonal leverage for a one-column, three-observation instrument matrix.",
    fields: [
      { key: "z1", label: "Instrument observation 1", short: "z₁", unit: "value", defaultValue: 1 },
      { key: "z2", label: "Instrument observation 2", short: "z₂", unit: "value", defaultValue: 2 },
      { key: "z3", label: "Instrument observation 3", short: "z₃", unit: "value", defaultValue: 3 },
    ],
    kind: "number",
    calculate: ({ z1, z2, z3 }) => safeDivide(z1 ** 2, z1 ** 2 + z2 ** 2 + z3 ** 2),
    interpret: (r) => `The first observation’s diagonal element P₁₁ is ${formatResult(r, "number")}.`,
  },
  {
    id: "difference-in-differences",
    name: "Difference-in-differences",
    category: "Econometrics & statistics",
    formula: "τ̂DiD=(ȲT,post−ȲT,pre)−(ȲC,post−ȲC,pre)",
    description: "Subtracts the control group’s before–after change from the treated group’s change.",
    fields: [
      { key: "tPost", label: "Treated post mean", short: "YT,post", unit: "outcome", defaultValue: 82 },
      { key: "tPre", label: "Treated pre mean", short: "YT,pre", unit: "outcome", defaultValue: 70 },
      { key: "cPost", label: "Control post mean", short: "YC,post", unit: "outcome", defaultValue: 74 },
      { key: "cPre", label: "Control pre mean", short: "YC,pre", unit: "outcome", defaultValue: 68 },
    ],
    kind: "number",
    calculate: ({ tPost, tPre, cPost, cPre }) => (tPost - tPre) - (cPost - cPre),
    interpret: (r) => `The difference-in-differences estimate is ${formatResult(r, "number")}.`,
  },
  {
    id: "fuzzy-rdd",
    name: "Fuzzy regression discontinuity",
    category: "Econometrics & statistics",
    formula: "τFRD = Outcome jump at c ÷ Treatment jump at c",
    description: "Computes the local Wald ratio from outcome and treatment discontinuities at a cutoff.",
    fields: [
      { key: "yRight", label: "Outcome limit above cutoff", short: "Yc+", unit: "outcome", defaultValue: 72 },
      { key: "yLeft", label: "Outcome limit below cutoff", short: "Yc−", unit: "outcome", defaultValue: 66 },
      { key: "dRight", label: "Treatment limit above cutoff", short: "Dc+", unit: "rate", defaultValue: 0.8 },
      { key: "dLeft", label: "Treatment limit below cutoff", short: "Dc−", unit: "rate", defaultValue: 0.3 },
    ],
    kind: "number",
    calculate: ({ yRight, yLeft, dRight, dLeft }) => safeDivide(yRight - yLeft, dRight - dLeft),
    interpret: (r) => `The fuzzy-RDD local effect estimate is ${formatResult(r, "number")}.`,
  },
  {
    id: "ar1-process",
    name: "AR(1) next value",
    category: "Econometrics & statistics",
    formula: "yt = c + ρyt−1 + εt",
    description: "Generates the next value of a first-order autoregressive process from a specified innovation.",
    fields: [
      { key: "constant", label: "Constant", short: "c", unit: "value", defaultValue: 2 },
      { key: "rho", label: "Persistence", short: "ρ", unit: "coefficient", defaultValue: 0.8, step: 0.01 },
      { key: "lag", label: "Previous value", short: "yt−1", unit: "value", defaultValue: 10 },
      { key: "shock", label: "Current innovation", short: "εt", unit: "value", defaultValue: 1 },
    ],
    kind: "number",
    calculate: ({ constant, rho, lag, shock }) => constant + rho * lag + shock,
    interpret: (r) => `The realized next value is ${formatResult(r, "number")}.`,
  },
  {
    id: "ar1-mean",
    name: "AR(1) unconditional mean",
    category: "Econometrics & statistics",
    formula: "μ = c/(1−ρ), |ρ|<1",
    description: "Computes the long-run mean of a covariance-stationary AR(1) process.",
    fields: [
      { key: "constant", label: "Constant", short: "c", unit: "value", defaultValue: 2 },
      { key: "rho", label: "Persistence", short: "ρ", unit: "coefficient", defaultValue: 0.8, step: 0.01 },
    ],
    kind: "number",
    calculate: ({ constant, rho }) => Math.abs(rho) < 1 ? safeDivide(constant, 1 - rho) : Number.NaN,
    interpret: (r) => `The stationary long-run mean is ${formatResult(r, "number")}.`,
  },
  {
    id: "ar1-forecast",
    name: "AR(1) h-step forecast",
    category: "Econometrics & statistics",
    formula: "Et[yt+h] = μ + ρʰ(yt−μ)",
    description: "Forecasts a stationary AR(1) process h periods ahead.",
    fields: [
      { key: "mean", label: "Long-run mean", short: "μ", unit: "value", defaultValue: 10 },
      { key: "rho", label: "Persistence", short: "ρ", unit: "coefficient", defaultValue: 0.8, step: 0.01 },
      { key: "current", label: "Current value", short: "yt", unit: "value", defaultValue: 16 },
      { key: "horizon", label: "Forecast horizon", short: "h", unit: "periods", defaultValue: 4 },
    ],
    kind: "number",
    calculate: ({ mean, rho, current, horizon }) => mean + rho ** horizon * (current - mean),
    interpret: (r) => `The conditional h-step forecast is ${formatResult(r, "number")}.`,
  },
  {
    id: "gmm-objective",
    name: "GMM criterion value",
    category: "Econometrics & statistics",
    formula: "θ̂ = arg minθ ḡ(θ)ᵀWḡ(θ)",
    description: "Evaluates a two-moment diagonal-weight GMM objective for a candidate parameter.",
    fields: [
      { key: "g1", label: "Sample moment 1", short: "ḡ₁", unit: "moment", defaultValue: 0.2 },
      { key: "g2", label: "Sample moment 2", short: "ḡ₂", unit: "moment", defaultValue: -0.1 },
      { key: "w1", label: "Weight on moment 1", short: "w₁", unit: "weight", defaultValue: 2 },
      { key: "w2", label: "Weight on moment 2", short: "w₂", unit: "weight", defaultValue: 1 },
    ],
    kind: "number",
    calculate: ({ g1, g2, w1, w2 }) => w1 * g1 ** 2 + w2 * g2 ** 2,
    interpret: (r) => `The candidate’s GMM criterion is ${formatResult(r, "number")}; estimation chooses the parameter that minimizes it.`,
  },
  {
    id: "capm-expected-return",
    name: "CAPM expected return",
    category: "Finance & investment",
    formula: "E[Ri] = Rf + βi(E[Rm]−Rf)",
    description: "Calculates an asset’s expected return from beta and the market risk premium.",
    fields: [
      { key: "riskFree", label: "Risk-free rate", short: "Rf", unit: "%", defaultValue: 4 },
      { key: "beta", label: "Asset beta", short: "βi", unit: "coefficient", defaultValue: 1.2, step: 0.1 },
      { key: "market", label: "Expected market return", short: "E[Rm]", unit: "%", defaultValue: 10 },
    ],
    kind: "percent",
    calculate: ({ riskFree, beta, market }) => riskFree + beta * (market - riskFree),
    interpret: (r) => `CAPM implies an expected asset return of ${formatResult(r, "percent")}.`,
  },
  {
    id: "two-asset-portfolio-variance",
    name: "Two-asset portfolio variance",
    category: "Finance & investment",
    formula: "Var(Rp) = wᵀΣw",
    description: "Computes portfolio variance from two weights, volatilities, and their correlation.",
    fields: [
      { key: "weight", label: "Weight in asset 1", short: "w₁", unit: "%", defaultValue: 60 },
      { key: "sd1", label: "Asset 1 volatility", short: "σ₁", unit: "%", defaultValue: 18 },
      { key: "sd2", label: "Asset 2 volatility", short: "σ₂", unit: "%", defaultValue: 12 },
      { key: "correlation", label: "Return correlation", short: "ρ₁₂", unit: "−1 to 1", defaultValue: 0.3, step: 0.05 },
    ],
    kind: "percent",
    calculate: ({ weight, sd1, sd2, correlation }) => {
      const w1 = weight / 100;
      const w2 = 1 - w1;
      return w1 ** 2 * sd1 ** 2 + w2 ** 2 * sd2 ** 2 + 2 * w1 * w2 * correlation * sd1 * sd2;
    },
    display: (variance) => `Variance = ${formatResult(variance, "number")} · σp = ${formatResult(Math.sqrt(variance), "percent")}`,
    interpret: (variance) => `Portfolio volatility is ${formatResult(Math.sqrt(variance), "percent")}.`,
  },
  {
    id: "icer",
    name: "Incremental cost-effectiveness ratio",
    category: "Health & inequality",
    formula: "ICER = ΔCost/ΔQALY",
    description: "Compares the incremental cost of an intervention with its incremental quality-adjusted life years.",
    fields: [
      { key: "cost", label: "Incremental cost", short: "ΔC", unit: "$", defaultValue: 25000 },
      { key: "qaly", label: "Incremental QALYs", short: "ΔQALY", unit: "QALYs", defaultValue: 1.5, step: 0.1 },
    ],
    kind: "currency",
    calculate: ({ cost, qaly }) => safeDivide(cost, qaly),
    interpret: (r) => `The intervention costs ${formatResult(r, "currency")} per additional QALY.`,
  },
  {
    id: "poverty-gap",
    name: "Poverty-gap index",
    category: "Health & inequality",
    formula: "PG = (1/N)Σi max{(z−yi)/z, 0}",
    description: "Averages normalized income shortfalls for a four-person population.",
    fields: [
      { key: "line", label: "Poverty line", short: "z", unit: "$", defaultValue: 100 },
      { key: "y1", label: "Income 1", short: "y₁", unit: "$", defaultValue: 40 },
      { key: "y2", label: "Income 2", short: "y₂", unit: "$", defaultValue: 75 },
      { key: "y3", label: "Income 3", short: "y₃", unit: "$", defaultValue: 110 },
      { key: "y4", label: "Income 4", short: "y₄", unit: "$", defaultValue: 160 },
    ],
    kind: "percent",
    calculate: ({ line, y1, y2, y3, y4 }) =>
      (Math.max(safeDivide(line - y1, line), 0) + Math.max(safeDivide(line - y2, line), 0) + Math.max(safeDivide(line - y3, line), 0) + Math.max(safeDivide(line - y4, line), 0)) * 25,
    interpret: (r) => `Average normalized poverty shortfall is ${formatResult(r, "percent")} across the full population.`,
  },
  {
    id: "gini-coefficient",
    name: "Gini coefficient",
    category: "Health & inequality",
    formula: "G = 1 − 2∫₀¹L(p)dp",
    description: "Computes the discrete Gini coefficient for five nonnegative incomes.",
    fields: [
      { key: "y1", label: "Income 1", short: "y₁", unit: "$", defaultValue: 20 },
      { key: "y2", label: "Income 2", short: "y₂", unit: "$", defaultValue: 35 },
      { key: "y3", label: "Income 3", short: "y₃", unit: "$", defaultValue: 60 },
      { key: "y4", label: "Income 4", short: "y₄", unit: "$", defaultValue: 110 },
      { key: "y5", label: "Income 5", short: "y₅", unit: "$", defaultValue: 225 },
    ],
    kind: "number",
    calculate: ({ y1, y2, y3, y4, y5 }) => {
      const incomes = [y1, y2, y3, y4, y5].sort((a, b) => a - b);
      const total = incomes.reduce((sum, value) => sum + value, 0);
      return safeDivide(incomes.reduce((sum, value, index) => sum + (2 * (index + 1) - incomes.length - 1) * value, 0), incomes.length * total);
    },
    interpret: (r) => `The discrete Gini coefficient is ${formatResult(r, "number")}, where 0 is perfect equality and 1 is maximal inequality.`,
  },
  {
    id: "preference-representation",
    name: "Preference representation",
    category: "Graduate neuroeconomics",
    formula: "x ⪰ y ⇔ u(x) ≥ u(y)",
    description: "Compares two utility indices to represent a weak preference ordering.",
    fields: [
      { key: "ux", label: "Utility of option x", short: "u(x)", unit: "utility", defaultValue: 8 },
      { key: "uy", label: "Utility of option y", short: "u(y)", unit: "utility", defaultValue: 6 },
    ],
    kind: "number",
    calculate: ({ ux, uy }) => ux - uy,
    display: (r) => r >= 0 ? "x ⪰ y" : "y ≻ x",
    interpret: (r) => r >= 0 ? `Option x is weakly preferred with utility margin ${formatResult(r, "number")}.` : `Option y is strictly preferred by ${formatResult(Math.abs(r), "number")} utility units.`,
  },
  {
    id: "feasible-budget-set",
    name: "Feasible budget-set slack",
    category: "Graduate neuroeconomics",
    formula: "pxx + pyy ≤ m",
    description: "Checks whether a two-good bundle lies inside the feasible budget set.",
    fields: [
      { key: "px", label: "Price of x", short: "px", unit: "$", defaultValue: 12 },
      { key: "x", label: "Quantity of x", short: "x", unit: "units", defaultValue: 7 },
      { key: "py", label: "Price of y", short: "py", unit: "$", defaultValue: 6 },
      { key: "y", label: "Quantity of y", short: "y", unit: "units", defaultValue: 10 },
      { key: "income", label: "Income", short: "m", unit: "$", defaultValue: 180 },
    ],
    kind: "currency",
    calculate: ({ px, x, py, y, income }) => income - px * x - py * y,
    interpret: (r) => r >= 0 ? `The bundle is feasible with ${formatResult(r, "currency")} of budget slack.` : `The bundle exceeds income by ${formatResult(Math.abs(r), "currency")}.`,
  },
  {
    id: "cobb-douglas-utility",
    name: "Cobb–Douglas utility",
    category: "Graduate neuroeconomics",
    formula: "u(x,y) = xᵃy¹⁻ᵃ",
    description: "Evaluates a two-good Cobb–Douglas utility function.",
    fields: [
      { key: "x", label: "Quantity of x", short: "x", unit: "units", defaultValue: 10 },
      { key: "y", label: "Quantity of y", short: "y", unit: "units", defaultValue: 20 },
      { key: "share", label: "Preference weight on x", short: "a", unit: "0–1", defaultValue: 0.4, step: 0.01 },
    ],
    kind: "number",
    calculate: ({ x, y, share }) => x ** share * y ** (1 - share),
    interpret: (r) => `The bundle yields ${formatResult(r, "number")} Cobb–Douglas utility units.`,
  },
  {
    id: "cobb-douglas-demand-x",
    name: "Cobb–Douglas demand for x",
    category: "Graduate neuroeconomics",
    formula: "x* = am/px",
    description: "Calculates Marshallian demand for x under Cobb–Douglas preferences.",
    fields: [
      { key: "share", label: "Preference weight on x", short: "a", unit: "0–1", defaultValue: 0.4, step: 0.01 },
      { key: "income", label: "Income", short: "m", unit: "$", defaultValue: 180 },
      { key: "price", label: "Price of x", short: "px", unit: "$", defaultValue: 12 },
    ],
    kind: "quantity",
    calculate: ({ share, income, price }) => safeDivide(share * income, price),
    interpret: (r) => `Optimal Cobb–Douglas demand for x is ${formatResult(r, "quantity")}.`,
  },
  {
    id: "cobb-douglas-demand-y",
    name: "Cobb–Douglas demand for y",
    category: "Graduate neuroeconomics",
    formula: "y* = (1−a)m/py",
    description: "Calculates Marshallian demand for y under Cobb–Douglas preferences.",
    fields: [
      { key: "share", label: "Preference weight on x", short: "a", unit: "0–1", defaultValue: 0.4, step: 0.01 },
      { key: "income", label: "Income", short: "m", unit: "$", defaultValue: 180 },
      { key: "price", label: "Price of y", short: "py", unit: "$", defaultValue: 6 },
    ],
    kind: "quantity",
    calculate: ({ share, income, price }) => safeDivide((1 - share) * income, price),
    interpret: (r) => `Optimal Cobb–Douglas demand for y is ${formatResult(r, "quantity")}.`,
  },
  {
    id: "cobb-douglas-consumer-problem",
    name: "Cobb–Douglas consumer optimum",
    category: "Graduate neuroeconomics",
    formula: "maxx,y xᵃy¹⁻ᵃ s.t. pxx+pyy≤m",
    description: "Solves the two demands and reports maximum utility under a Cobb–Douglas consumer problem.",
    fields: [
      { key: "share", label: "Preference weight on x", short: "a", unit: "0–1", defaultValue: 0.4, step: 0.01 },
      { key: "income", label: "Income", short: "m", unit: "$", defaultValue: 180 },
      { key: "px", label: "Price of x", short: "px", unit: "$", defaultValue: 12 },
      { key: "py", label: "Price of y", short: "py", unit: "$", defaultValue: 6 },
    ],
    kind: "number",
    calculate: ({ share, income, px, py }) => {
      const x = safeDivide(share * income, px);
      const y = safeDivide((1 - share) * income, py);
      return x ** share * y ** (1 - share);
    },
    display: (utility, { share, income, px, py }) => `x* = ${formatResult(safeDivide(share * income, px), "number")} · y* = ${formatResult(safeDivide((1 - share) * income, py), "number")} · u* = ${formatResult(utility, "number")}`,
    interpret: (utility) => `The optimal bundle yields ${formatResult(utility, "number")} utility units and exhausts the budget.`,
  },
  {
    id: "three-option-softmax",
    name: "Three-option softmax",
    category: "Graduate neuroeconomics",
    formula: "P(i) = exp(βVi)/Σj exp(βVj)",
    description: "Calculates the probability of choosing option 1 among three learned values.",
    fields: [
      { key: "v1", label: "Value of option 1", short: "V₁", unit: "value", defaultValue: 8 },
      { key: "v2", label: "Value of option 2", short: "V₂", unit: "value", defaultValue: 6 },
      { key: "v3", label: "Value of option 3", short: "V₃", unit: "value", defaultValue: 5 },
      { key: "beta", label: "Inverse temperature", short: "β", unit: "coefficient", defaultValue: 1, step: 0.1 },
    ],
    kind: "percent",
    calculate: ({ v1, v2, v3, beta }) => {
      const maxValue = Math.max(v1, v2, v3);
      const e1 = Math.exp(beta * (v1 - maxValue));
      const e2 = Math.exp(beta * (v2 - maxValue));
      const e3 = Math.exp(beta * (v3 - maxValue));
      return safeDivide(e1, e1 + e2 + e3) * 100;
    },
    interpret: (r) => `Option 1 receives ${formatResult(r, "percent")} choice probability.`,
  },
  {
    id: "absolute-risk-aversion",
    name: "Absolute risk aversion",
    category: "Graduate neuroeconomics",
    formula: "A(w) = −u″(w)/u′(w)",
    description: "Evaluates Arrow–Pratt absolute risk aversion from supplied first and second utility derivatives.",
    fields: [
      { key: "first", label: "First utility derivative", short: "u′(w)", unit: "derivative", defaultValue: 0.5 },
      { key: "second", label: "Second utility derivative", short: "u″(w)", unit: "derivative", defaultValue: -0.02 },
    ],
    kind: "number",
    calculate: ({ first, second }) => -safeDivide(second, first),
    interpret: (r) => `Absolute risk aversion at this wealth level is ${formatResult(r, "number")}.`,
  },
  {
    id: "relative-risk-aversion",
    name: "Relative risk aversion",
    category: "Graduate neuroeconomics",
    formula: "R(w) = −w u″(w)/u′(w)",
    description: "Scales Arrow–Pratt absolute risk aversion by wealth.",
    fields: [
      { key: "wealth", label: "Wealth", short: "w", unit: "$", defaultValue: 100 },
      { key: "first", label: "First utility derivative", short: "u′(w)", unit: "derivative", defaultValue: 0.5 },
      { key: "second", label: "Second utility derivative", short: "u″(w)", unit: "derivative", defaultValue: -0.02 },
    ],
    kind: "number",
    calculate: ({ wealth, first, second }) => -wealth * safeDivide(second, first),
    interpret: (r) => `Relative risk aversion at this wealth level is ${formatResult(r, "number")}.`,
  },
  {
    id: "discounted-utility-stream",
    name: "Exponentially discounted utility stream",
    category: "Graduate neuroeconomics",
    formula: "U = Σt δᵗu(ct)",
    description: "Aggregates utility today and over three future periods with exponential discounting.",
    fields: [
      { key: "u0", label: "Utility at t=0", short: "u(c₀)", unit: "utility", defaultValue: 10 },
      { key: "u1", label: "Utility at t=1", short: "u(c₁)", unit: "utility", defaultValue: 10 },
      { key: "u2", label: "Utility at t=2", short: "u(c₂)", unit: "utility", defaultValue: 10 },
      { key: "u3", label: "Utility at t=3", short: "u(c₃)", unit: "utility", defaultValue: 10 },
      { key: "delta", label: "Discount factor", short: "δ", unit: "0–1", defaultValue: 0.95, step: 0.01 },
    ],
    kind: "number",
    calculate: ({ u0, u1, u2, u3, delta }) => u0 + delta * u1 + delta ** 2 * u2 + delta ** 3 * u3,
    interpret: (r) => `The discounted utility stream totals ${formatResult(r, "number")} utility units.`,
  },
  {
    id: "three-person-fehr-schmidt",
    name: "Three-person Fehr–Schmidt utility",
    category: "Graduate neuroeconomics",
    formula: "Ui=xi−αi/(n−1)Σj≠i max(xj−xi,0)−βi/(n−1)Σj≠i max(xi−xj,0)",
    description: "Applies the general inequity-aversion model to one decision-maker and two comparison people.",
    fields: [
      { key: "own", label: "Own payoff", short: "xi", unit: "$", defaultValue: 50 },
      { key: "other1", label: "Other payoff 1", short: "xj", unit: "$", defaultValue: 70 },
      { key: "other2", label: "Other payoff 2", short: "xk", unit: "$", defaultValue: 30 },
      { key: "alpha", label: "Disadvantage aversion", short: "αi", unit: "coefficient", defaultValue: 0.8, step: 0.05 },
      { key: "beta", label: "Advantage aversion", short: "βi", unit: "coefficient", defaultValue: 0.3, step: 0.05 },
    ],
    kind: "number",
    calculate: ({ own, other1, other2, alpha, beta }) =>
      own -
      (alpha / 2) * (Math.max(other1 - own, 0) + Math.max(other2 - own, 0)) -
      (beta / 2) * (Math.max(own - other1, 0) + Math.max(own - other2, 0)),
    interpret: (r) => `Inequity-adjusted utility is ${formatResult(r, "number")}.`,
  },
  {
    id: "regression-prediction",
    name: "Linear regression prediction",
    category: "Graduate neuroeconomics",
    formula: "y = Xβ + ε",
    description: "Computes a fitted outcome from an intercept and two regressors, excluding the disturbance.",
    fields: [
      { key: "intercept", label: "Intercept", short: "β₀", unit: "coefficient", defaultValue: 2 },
      { key: "x1", label: "Regressor 1", short: "x₁", unit: "value", defaultValue: 4 },
      { key: "b1", label: "Coefficient 1", short: "β₁", unit: "coefficient", defaultValue: 1.5 },
      { key: "x2", label: "Regressor 2", short: "x₂", unit: "value", defaultValue: 3 },
      { key: "b2", label: "Coefficient 2", short: "β₂", unit: "coefficient", defaultValue: -0.5 },
    ],
    kind: "number",
    calculate: ({ intercept, x1, b1, x2, b2 }) => intercept + x1 * b1 + x2 * b2,
    interpret: (r) => `The fitted conditional outcome is ${formatResult(r, "number")}.`,
  },
  {
    id: "joint-likelihood",
    name: "Joint trial likelihood",
    category: "Graduate neuroeconomics",
    formula: "p(data|θ,M) = Πt p(choicet,RTt,neuralt|θ,designt)",
    description: "Multiplies three trial-level likelihood contributions under conditional independence.",
    fields: [
      { key: "p1", label: "Trial likelihood 1", short: "p₁", unit: "0–1", defaultValue: 0.7, step: 0.01 },
      { key: "p2", label: "Trial likelihood 2", short: "p₂", unit: "0–1", defaultValue: 0.6, step: 0.01 },
      { key: "p3", label: "Trial likelihood 3", short: "p₃", unit: "0–1", defaultValue: 0.8, step: 0.01 },
    ],
    kind: "number",
    calculate: ({ p1, p2, p3 }) => p1 * p2 * p3,
    interpret: (r) => `The joint likelihood is ${formatResult(r, "number")}.`,
  },
  {
    id: "ddm-process-increment",
    name: "Drift-diffusion process increment",
    category: "Graduate neuroeconomics",
    formula: "dx = v dt + σ dW, with dW = √dt·z",
    description: "Calculates one simulated evidence increment using a supplied standard-normal shock.",
    fields: [
      { key: "drift", label: "Drift rate", short: "v", unit: "evidence/s", defaultValue: 0.3, step: 0.01 },
      { key: "dt", label: "Time step", short: "dt", unit: "seconds", defaultValue: 0.1, step: 0.01 },
      { key: "noise", label: "Noise scale", short: "σ", unit: "scale", defaultValue: 1, step: 0.05 },
      { key: "shock", label: "Standard-normal shock", short: "z", unit: "z-score", defaultValue: 0.5, step: 0.1 },
    ],
    kind: "number",
    calculate: ({ drift, dt, noise, shock }) => drift * dt + noise * Math.sqrt(dt) * shock,
    interpret: (r) => `Evidence changes by ${formatResult(r, "number")} over this simulated time step.`,
  },
  {
    id: "ddm-upper-boundary",
    name: "Upper decision-boundary distance",
    category: "Graduate neuroeconomics",
    formula: "Upper choice occurs when x ≥ a",
    description: "Measures remaining evidence to the upper drift-diffusion boundary.",
    fields: [
      { key: "state", label: "Current evidence state", short: "x", unit: "evidence", defaultValue: 0.7 },
      { key: "boundary", label: "Upper boundary", short: "a", unit: "evidence", defaultValue: 1 },
    ],
    kind: "number",
    calculate: ({ state, boundary }) => boundary - state,
    interpret: (r) => r <= 0 ? "The upper decision boundary has been reached." : `${formatResult(r, "number")} evidence units remain before the upper boundary.`,
  },
  {
    id: "ddm-lower-boundary",
    name: "Lower decision-boundary distance",
    category: "Graduate neuroeconomics",
    formula: "Lower choice occurs when x ≤ 0",
    description: "Measures current evidence above the lower drift-diffusion boundary.",
    fields: [
      { key: "state", label: "Current evidence state", short: "x", unit: "evidence", defaultValue: 0.3 },
    ],
    kind: "number",
    calculate: ({ state }) => state,
    interpret: (r) => r <= 0 ? "The lower decision boundary has been reached." : `${formatResult(r, "number")} evidence units remain above the lower boundary.`,
  },
  {
    id: "unnormalized-bayesian-posterior",
    name: "Unnormalized Bayesian posterior",
    category: "Graduate neuroeconomics",
    formula: "p(θ|data) ∝ p(data|θ)p(θ)",
    description: "Computes the unnormalized posterior kernel from likelihood and prior density.",
    fields: [
      { key: "likelihood", label: "Likelihood", short: "p(data|θ)", unit: "density", defaultValue: 0.4, step: 0.01 },
      { key: "prior", label: "Prior density", short: "p(θ)", unit: "density", defaultValue: 0.3, step: 0.01 },
    ],
    kind: "number",
    calculate: ({ likelihood, prior }) => likelihood * prior,
    interpret: (r) => `The posterior kernel is ${formatResult(r, "number")}; divide by the evidence to normalize across θ.`,
  },
  {
    id: "kalman-update",
    name: "Kalman mean update",
    category: "Graduate neuroeconomics",
    formula: "μpost = μprior + K(y−μprior)",
    description: "Updates a prior mean toward a new observation using the Kalman gain.",
    fields: [
      { key: "prior", label: "Prior mean", short: "μprior", unit: "value", defaultValue: 6 },
      { key: "gain", label: "Kalman gain", short: "K", unit: "0–1", defaultValue: 0.35, step: 0.01 },
      { key: "observation", label: "New observation", short: "y", unit: "value", defaultValue: 10 },
    ],
    kind: "number",
    calculate: ({ prior, gain, observation }) => prior + gain * (observation - prior),
    interpret: (r) => `The posterior mean is ${formatResult(r, "number")}.`,
  },
  {
    id: "divisive-normalization",
    name: "Divisive normalization",
    category: "Graduate neuroeconomics",
    formula: "Ri = Vi/[σ + Σj wjVj]",
    description: "Normalizes one option’s value by a weighted three-option value pool.",
    fields: [
      { key: "target", label: "Target value", short: "Vi", unit: "value", defaultValue: 8 },
      { key: "sigma", label: "Semisaturation constant", short: "σ", unit: "value", defaultValue: 1 },
      { key: "v1", label: "Pool value 1", short: "V₁", unit: "value", defaultValue: 8 },
      { key: "v2", label: "Pool value 2", short: "V₂", unit: "value", defaultValue: 6 },
      { key: "v3", label: "Pool value 3", short: "V₃", unit: "value", defaultValue: 4 },
      { key: "weight", label: "Common pool weight", short: "w", unit: "coefficient", defaultValue: 1 },
    ],
    kind: "number",
    calculate: ({ target, sigma, v1, v2, v3, weight }) => safeDivide(target, sigma + weight * (v1 + v2 + v3)),
    interpret: (r) => `The normalized response is ${formatResult(r, "number")}.`,
  },
  {
    id: "multiattribute-value",
    name: "Multiattribute value",
    category: "Graduate neuroeconomics",
    formula: "Vi = Σk wkxik + interactions + state dependence",
    description: "Scores an option from three weighted attributes plus a combined interaction/state term.",
    fields: [
      { key: "x1", label: "Attribute 1", short: "xi1", unit: "value", defaultValue: 8 },
      { key: "w1", label: "Weight 1", short: "w₁", unit: "weight", defaultValue: 0.5, step: 0.05 },
      { key: "x2", label: "Attribute 2", short: "xi2", unit: "value", defaultValue: 6 },
      { key: "w2", label: "Weight 2", short: "w₂", unit: "weight", defaultValue: 0.3, step: 0.05 },
      { key: "x3", label: "Attribute 3", short: "xi3", unit: "value", defaultValue: 4 },
      { key: "w3", label: "Weight 3", short: "w₃", unit: "weight", defaultValue: 0.2, step: 0.05 },
      { key: "extra", label: "Interactions and state term", short: "I+S", unit: "value", defaultValue: 0.5 },
    ],
    kind: "number",
    calculate: ({ x1, w1, x2, w2, x3, w3, extra }) => x1 * w1 + x2 * w2 + x3 * w3 + extra,
    interpret: (r) => `The option’s multiattribute value is ${formatResult(r, "number")}.`,
  },
  {
    id: "binary-log-likelihood",
    name: "Binary log-likelihood",
    category: "Graduate neuroeconomics",
    formula: "log L = Σt[yt log pt + (1−yt)log(1−pt)]",
    description: "Computes the Bernoulli log-likelihood for three binary observations and predicted probabilities.",
    fields: [
      { key: "y1", label: "Outcome 1 (0 or 1)", short: "y₁", unit: "binary", defaultValue: 1 },
      { key: "p1", label: "Predicted probability 1", short: "p₁", unit: "0–1", defaultValue: 0.8, step: 0.01 },
      { key: "y2", label: "Outcome 2 (0 or 1)", short: "y₂", unit: "binary", defaultValue: 0 },
      { key: "p2", label: "Predicted probability 2", short: "p₂", unit: "0–1", defaultValue: 0.3, step: 0.01 },
      { key: "y3", label: "Outcome 3 (0 or 1)", short: "y₃", unit: "binary", defaultValue: 1 },
      { key: "p3", label: "Predicted probability 3", short: "p₃", unit: "0–1", defaultValue: 0.65, step: 0.01 },
    ],
    kind: "number",
    calculate: ({ y1, p1, y2, p2, y3, p3 }) =>
      y1 * Math.log(p1) + (1 - y1) * Math.log(1 - p1) +
      y2 * Math.log(p2) + (1 - y2) * Math.log(1 - p2) +
      y3 * Math.log(p3) + (1 - y3) * Math.log(1 - p3),
    interpret: (r) => `The binary log-likelihood is ${formatResult(r, "number")}; values closer to zero indicate better fit for the same data.`,
  },
  {
    id: "logistic-function",
    name: "Logistic function",
    category: "Graduate neuroeconomics",
    formula: "σ(z) = 1/(1+e⁻ᶻ)",
    description: "Maps any real-valued index to a probability.",
    fields: [
      { key: "z", label: "Linear index", short: "z", unit: "value", defaultValue: 1.5 },
    ],
    kind: "percent",
    calculate: ({ z }) => sigmoid(z) * 100,
    interpret: (r) => `The logistic probability is ${formatResult(r, "percent")}.`,
  },
  {
    id: "logistic-derivative",
    name: "Logistic derivative",
    category: "Graduate neuroeconomics",
    formula: "σ′(z) = σ(z)[1−σ(z)]",
    description: "Calculates the slope of the logistic function at a given index.",
    fields: [
      { key: "z", label: "Linear index", short: "z", unit: "value", defaultValue: 1.5 },
    ],
    kind: "number",
    calculate: ({ z }) => sigmoid(z) * (1 - sigmoid(z)),
    interpret: (r) => `The local logistic slope is ${formatResult(r, "number")}.`,
  },
  {
    id: "logit-transform",
    name: "Logit transform",
    category: "Graduate neuroeconomics",
    formula: "logit(p) = ln[p/(1−p)]",
    description: "Converts a probability into log odds.",
    fields: [
      { key: "probability", label: "Probability", short: "p", unit: "%", defaultValue: 75 },
    ],
    kind: "number",
    calculate: ({ probability }) => {
      const p = probability / 100;
      return Math.log(safeDivide(p, 1 - p));
    },
    interpret: (r) => `The corresponding log odds are ${formatResult(r, "number")}.`,
  },
  {
    id: "lagrangian-value",
    name: "Consumer Lagrangian value",
    category: "Graduate neuroeconomics",
    formula: "ℒ = u(x,y)+λ(m−pxx−pyy)",
    description: "Evaluates the Lagrangian for a two-good consumer problem at a candidate bundle and multiplier.",
    fields: [
      { key: "utility", label: "Utility at bundle", short: "u(x,y)", unit: "utility", defaultValue: 20 },
      { key: "lambda", label: "Multiplier", short: "λ", unit: "coefficient", defaultValue: 0.5 },
      { key: "income", label: "Income", short: "m", unit: "$", defaultValue: 180 },
      { key: "spendingX", label: "Spending on x", short: "pxx", unit: "$", defaultValue: 90 },
      { key: "spendingY", label: "Spending on y", short: "pyy", unit: "$", defaultValue: 80 },
    ],
    kind: "number",
    calculate: ({ utility, lambda, income, spendingX, spendingY }) => utility + lambda * (income - spendingX - spendingY),
    interpret: (r) => `The Lagrangian evaluates to ${formatResult(r, "number")} at this candidate bundle.`,
  },
  {
    id: "marginal-utility-per-dollar",
    name: "Lagrangian optimum condition",
    category: "Graduate neuroeconomics",
    formula: "MUx/px = MUy/py = λ",
    description: "Checks equality of marginal utility per dollar across two goods.",
    fields: [
      { key: "mux", label: "Marginal utility of x", short: "MUx", unit: "utility", defaultValue: 12 },
      { key: "px", label: "Price of x", short: "px", unit: "$", defaultValue: 6 },
      { key: "muy", label: "Marginal utility of y", short: "MUy", unit: "utility", defaultValue: 8 },
      { key: "py", label: "Price of y", short: "py", unit: "$", defaultValue: 4 },
    ],
    kind: "number",
    calculate: ({ mux, px, muy, py }) => safeDivide(mux, px) - safeDivide(muy, py),
    interpret: (r) => Math.abs(r) < 0.001 ? "Marginal utility per dollar is equalized across goods." : `The marginal-utility-per-dollar gap is ${formatResult(r, "number")}.`,
  },
  {
    id: "continuous-uniform-expectation",
    name: "Continuous expectation (uniform)",
    category: "Econometrics & statistics",
    formula: "E[X] = ∫xp(x)dx = (a+b)/2 for X~Uniform(a,b)",
    description: "Evaluates a continuous expectation for a uniform distribution.",
    fields: [
      { key: "lower", label: "Lower support bound", short: "a", unit: "value", defaultValue: 2 },
      { key: "upper", label: "Upper support bound", short: "b", unit: "value", defaultValue: 10 },
    ],
    kind: "number",
    calculate: ({ lower, upper }) => (lower + upper) / 2,
    interpret: (r) => `The uniform distribution has expected value ${formatResult(r, "number")}.`,
  },
  {
    id: "conditional-probability",
    name: "Conditional probability",
    category: "Econometrics & statistics",
    formula: "P(A|B) = P(A∩B)/P(B)",
    description: "Calculates a conditional probability from the joint and conditioning-event probabilities.",
    fields: [
      { key: "joint", label: "Joint probability", short: "P(A∩B)", unit: "%", defaultValue: 24 },
      { key: "condition", label: "Conditioning probability", short: "P(B)", unit: "%", defaultValue: 40 },
    ],
    kind: "percent",
    calculate: ({ joint, condition }) => safeDivide(joint, condition) * 100,
    interpret: (r) => `Conditional on B, event A has probability ${formatResult(r, "percent")}.`,
  },
  {
    id: "law-total-probability",
    name: "Law of total probability",
    category: "Econometrics & statistics",
    formula: "P(A) = Σb P(A|b)P(b)",
    description: "Combines two mutually exclusive conditioning states into the unconditional probability of A.",
    fields: [
      { key: "a1", label: "P(A|b₁)", short: "P(A|b₁)", unit: "%", defaultValue: 70 },
      { key: "b1", label: "P(b₁)", short: "P(b₁)", unit: "%", defaultValue: 40 },
      { key: "a2", label: "P(A|b₂)", short: "P(A|b₂)", unit: "%", defaultValue: 30 },
      { key: "b2", label: "P(b₂)", short: "P(b₂)", unit: "%", defaultValue: 60 },
    ],
    kind: "percent",
    calculate: ({ a1, b1, a2, b2 }) => (a1 / 100) * b1 + (a2 / 100) * b2,
    interpret: (r) => `The unconditional probability of A is ${formatResult(r, "percent")}.`,
  },
  {
    id: "learning-rate-transformation",
    name: "Learning-rate transformation",
    category: "Graduate neuroeconomics",
    formula: "α = σ(a)",
    description: "Maps an unconstrained model parameter to a valid learning rate between zero and one.",
    fields: [
      { key: "raw", label: "Unconstrained parameter", short: "a", unit: "real", defaultValue: 0.8 },
    ],
    kind: "percent",
    calculate: ({ raw }) => sigmoid(raw) * 100,
    interpret: (r) => `The transformed learning rate is ${formatResult(r, "percent")}.`,
  },
  {
    id: "positive-parameter-transformation",
    name: "Positive-parameter transformation",
    category: "Graduate neuroeconomics",
    formula: "k = exp(κ)",
    description: "Exponentiates an unconstrained parameter to enforce strict positivity.",
    fields: [
      { key: "raw", label: "Unconstrained parameter", short: "κ", unit: "real", defaultValue: -1.2 },
    ],
    kind: "number",
    calculate: ({ raw }) => Math.exp(raw),
    interpret: (r) => `The positive transformed parameter is ${formatResult(r, "number")}.`,
  },
];

const formulas = [...foundationFormulas, ...bridgeFormulas];

const categories = ["All", ...Array.from(new Set(formulas.map((item) => item.category)))];

function formatResult(value: number, kind: ResultKind) {
  if (!Number.isFinite(value)) return "—";
  const absolute = Math.abs(value);
  const fractionDigits = absolute >= 1000 ? 0 : absolute >= 100 ? 1 : 2;
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: kind === "percent" ? 2 : 0,
  }).format(value);

  if (kind === "currency") return `$${formatted}`;
  if (kind === "percent") return `${formatted}%`;
  if (kind === "multiplier") return `${formatted}×`;
  if (kind === "years") return `${formatted} years`;
  if (kind === "quantity") return `${formatted} units`;
  if (kind === "rate") return `${formatted} : 1`;
  if (kind === "seconds") return `${formatted} seconds`;
  return formatted;
}

function initialValues(formula: Formula) {
  return Object.fromEntries(
    formula.fields.map((field) => [field.key, field.defaultValue]),
  );
}

export default function Home() {
  const [activeId, setActiveId] = useState("gdp");
  const [activeCategory, setActiveCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [values, setValues] = useState<Record<string, number>>(
    initialValues(formulas[0]),
  );
  const [copied, setCopied] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        event.key === "/" &&
        document.activeElement?.tagName !== "INPUT"
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const activeFormula =
    formulas.find((formula) => formula.id === activeId) ?? formulas[0];
  const result = activeFormula.calculate(values);
  const validResult = Number.isFinite(result);
  const formattedResult = validResult
    ? activeFormula.display?.(result, values) ??
      formatResult(result, activeFormula.kind)
    : "Check inputs";

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return formulas.filter((formula) => {
      const categoryMatch =
        activeCategory === "All" || formula.category === activeCategory;
      const queryMatch =
        !needle ||
        formula.name.toLowerCase().includes(needle) ||
        formula.formula.toLowerCase().includes(needle) ||
        formula.description.toLowerCase().includes(needle);
      return categoryMatch && queryMatch;
    });
  }, [activeCategory, query]);

  const chooseFormula = (formula: Formula) => {
    setActiveId(formula.id);
    setValues(initialValues(formula));
    setCopied(false);
    if (window.innerWidth < 900) {
      window.setTimeout(() => {
        document
          .getElementById("calculator")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  };

  const reset = () => {
    setValues(initialValues(activeFormula));
    setCopied(false);
  };

  const copyResult = async () => {
    if (!validResult) return;
    const summary = `${activeFormula.name}: ${formattedResult} — ${activeFormula.formula}`;
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Econome by Pearling home">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span>Econome <small>by Pearling</small></span>
        </a>
        <div className="topbar-note">
          <span className="status-dot" aria-hidden="true" />
          {formulas.length} practical calculators
        </div>
        <a className="formula-link" href="#library">Browse library <span aria-hidden="true">↓</span></a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Economics & decision science, made calculable</p>
          <h1>From theory to a <em>number.</em></h1>
          <p className="hero-description">
            A focused toolkit for economics, neuroeconomics, and behavioral
            decision science, built for coursework, research checks, and clearer decisions.
          </p>
          <div className="search-wrap">
            <span className="search-icon" aria-hidden="true">⌕</span>
            <label className="sr-only" htmlFor="formula-search">Search formulas</label>
            <input
              id="formula-search"
              ref={searchRef}
              type="search"
              placeholder="Search GDP, prospect theory, Q-learning…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <kbd>/</kbd>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="hero-card hero-card-a">
            <span>PRICE ELASTICITY</span>
            <strong>−1.50</strong>
            <small>elastic demand</small>
          </div>
          <div className="hero-card hero-card-b">
            <span>REAL GROWTH</span>
            <strong>+2.98%</strong>
            <div className="sparkline">
              <i /><i /><i /><i /><i /><i />
            </div>
          </div>
          <div className="hero-symbol">∑</div>
        </div>
      </section>

      <section className="workspace" id="library">
        <aside className="library-panel" aria-label="Formula library">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Formula library</p>
              <h2>Choose a calculator</h2>
            </div>
            <span className="count-badge">{filtered.length}</span>
          </div>

          <div className="category-tabs" role="tablist" aria-label="Formula categories">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                role="tab"
                aria-selected={activeCategory === category}
                className={activeCategory === category ? "active" : ""}
                onClick={() => setActiveCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>

          <div className="formula-list">
            {filtered.length > 0 ? (
              filtered.map((formula, index) => (
                <button
                  className={`formula-item ${activeId === formula.id ? "selected" : ""}`}
                  type="button"
                  onClick={() => chooseFormula(formula)}
                  key={formula.id}
                >
                  <span className="formula-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="formula-item-copy">
                    <strong>{formula.name}</strong>
                    <small>{formula.category}</small>
                  </span>
                  <span className="item-arrow" aria-hidden="true">↗</span>
                </button>
              ))
            ) : (
              <div className="empty-state">
                <span>∅</span>
                <strong>No formulas found</strong>
                <p>Try a broader search or choose another category.</p>
              </div>
            )}
          </div>
        </aside>

        <section className="calculator-card" id="calculator" aria-live="polite">
          <div className="calculator-header">
            <div>
              <span className="category-label">{activeFormula.category}</span>
              <h2>{activeFormula.name}</h2>
              <p>{activeFormula.description}</p>
            </div>
            <button className="reset-button" type="button" onClick={reset}>
              <span aria-hidden="true">↺</span> Reset
            </button>
          </div>

          <div className="formula-strip">
            <span>The formula</span>
            <strong>{activeFormula.formula}</strong>
          </div>

          <div className="calculator-body">
            <div className="inputs-panel">
              <div className="minor-heading">
                <span>Inputs</span>
                <small>Use consistent units</small>
              </div>
              <div className="input-grid">
                {activeFormula.fields.map((field) => (
                  <label className="field" key={field.key}>
                    <span className="field-label">
                      {field.label}
                      <abbr title={field.label}>{field.short}</abbr>
                    </span>
                    <span className="input-shell">
                      {field.unit === "$" && <span className="prefix">$</span>}
                      <input
                        type="number"
                        inputMode="decimal"
                        step={field.step ?? "any"}
                        value={Number.isNaN(values[field.key]) ? "" : values[field.key]}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            [field.key]:
                              event.target.value === ""
                                ? Number.NaN
                                : Number(event.target.value),
                          }))
                        }
                        aria-label={`${field.label}${field.unit ? ` in ${field.unit}` : ""}`}
                      />
                      {field.unit && field.unit !== "$" && (
                        <span className="suffix">{field.unit}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className={`result-panel ${validResult ? "" : "invalid"}`}>
              <span className="result-kicker">Calculated result</span>
              <output>{formattedResult}</output>
              <p>
                {validResult
                  ? activeFormula.interpret(result, values)
                  : "A denominator cannot be zero, and every field needs a valid number."}
              </p>
              <button
                type="button"
                className="copy-button"
                onClick={copyResult}
                disabled={!validResult}
              >
                <span aria-hidden="true">{copied ? "✓" : "⧉"}</span>
                {copied ? "Copied" : "Copy result"}
              </button>
            </div>
          </div>

          <div className="working-note">
            <span className="note-icon" aria-hidden="true">i</span>
            <div>
              <strong>How this was calculated</strong>
              <p>
                {activeFormula.fields
                  .map((field) => `${field.short} = ${Number.isFinite(values[field.key]) ? values[field.key] : "—"}`)
                  .join(" · ")}
              </p>
            </div>
          </div>
        </section>
      </section>

      <section className="reference-band">
        <div>
          <p className="eyebrow">A useful reminder</p>
          <h2>Models simplify. Context decides.</h2>
        </div>
        <p>
          These calculators apply standard textbook relationships. Units,
          assumptions, timing, and data quality still shape what a result means
          in the real world.
        </p>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span>Econome <small>by Pearling</small></span>
        </a>
        <p>© All Rights Reserved 2026 · Designed by Pearling.</p>
        <a href="#top">Back to top ↑</a>
      </footer>
    </main>
  );
}

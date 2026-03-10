/**
 * myn_ynab tool - YNAB budget management
 */

import { Type } from '@sinclair/typebox';
import type { MynApiClient } from '../client.js';
import { jsonResult, errorResult } from '../client.js';

export const YnabInputSchema = Type.Object({
  action: Type.Union([
    Type.Literal('budget_overview'),
    Type.Literal('category_balance'),
    Type.Literal('account_balances'),
    Type.Literal('set_category_goal'),
    Type.Literal('spending_insights'),
    Type.Literal('upcoming_bills')
  ]),
  // category_balance / set_category_goal parameters
  categoryName: Type.Optional(Type.String({ description: 'Category name to search for (fuzzy match)' })),
  // set_category_goal parameters
  goalType: Type.Optional(Type.String({ description: 'Goal type: TB (Target Balance), TBD (Target Balance by Date), MF (Monthly Funding), NEED (Plan Your Spending)' })),
  goalTargetDollars: Type.Optional(Type.Number({ description: 'Goal target amount in dollars (e.g., 500.00)' })),
  goalTargetMonth: Type.Optional(Type.String({ description: 'Target month in YYYY-MM format (e.g., 2026-06). Required for TBD goals.' })),
  // spending_insights parameters
  months: Type.Optional(Type.Number({ description: 'Number of months to analyze (default: 3)' })),
  // upcoming_bills parameters
  days: Type.Optional(Type.Number({ description: 'Number of days to look ahead for bills (default: 7)' }))
});

export type YnabInput = typeof YnabInputSchema.static;

export async function executeYnab(
  client: MynApiClient,
  input: YnabInput
): Promise<{ success: true; data: unknown } | { success: false; error: string; details?: unknown }> {
  try {
    switch (input.action) {
      case 'budget_overview':
        return await getBudgetOverview(client);
      case 'category_balance':
        return await getCategoryBalance(client, input);
      case 'account_balances':
        return await getAccountBalances(client);
      case 'set_category_goal':
        return await setCategoryGoal(client, input);
      case 'spending_insights':
        return await getSpendingInsights(client, input);
      case 'upcoming_bills':
        return await getUpcomingBills(client, input);
      default:
        return errorResult(`Unknown action: ${(input as { action: string }).action}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      return errorResult(error.message);
    }
    return errorResult('Unknown error occurred');
  }
}

async function getBudgetOverview(client: MynApiClient) {
  const data = await client.get<unknown>('/api/v1/ynab/budget/overview');
  return jsonResult(data);
}

async function getCategoryBalance(client: MynApiClient, input: YnabInput) {
  if (!input.categoryName) {
    return errorResult('categoryName is required for category_balance action');
  }
  const data = await client.get<unknown>(
    `/api/v1/ynab/budget/categories/search?query=${encodeURIComponent(input.categoryName)}`
  );
  return jsonResult(data);
}

async function getAccountBalances(client: MynApiClient) {
  const data = await client.get<unknown>('/api/v1/ynab/budget/accounts');
  return jsonResult(data);
}

async function setCategoryGoal(client: MynApiClient, input: YnabInput) {
  if (!input.categoryName) {
    return errorResult('categoryName is required for set_category_goal action');
  }
  if (!input.goalType) {
    return errorResult('goalType is required for set_category_goal action (TB, TBD, MF, NEED)');
  }

  // First find the category by name to get its ID
  const searchResult = await client.get<{ id: string; name: string }>(
    `/api/v1/ynab/budget/categories/search?query=${encodeURIComponent(input.categoryName)}`
  );

  if (!searchResult || !searchResult.id) {
    return errorResult(`Category '${input.categoryName}' not found`);
  }

  // Format target month as YYYY-MM-01 if provided
  let goalTargetMonth = input.goalTargetMonth;
  if (goalTargetMonth && !goalTargetMonth.endsWith('-01')) {
    goalTargetMonth = goalTargetMonth + '-01';
  }

  const body: Record<string, unknown> = {
    goalType: input.goalType
  };
  if (input.goalTargetDollars != null) body.goalTargetDollars = input.goalTargetDollars;
  if (goalTargetMonth) body.goalTargetMonth = goalTargetMonth;

  const data = await client.patch<unknown>(
    `/api/v1/ynab/budget/categories/${searchResult.id}/goal`,
    body
  );
  return jsonResult(data);
}

async function getSpendingInsights(client: MynApiClient, input: YnabInput) {
  const months = input.months || 3;
  const data = await client.get<unknown>(
    `/api/v1/ynab/analytics/spending?months=${months}`
  );
  return jsonResult(data);
}

async function getUpcomingBills(client: MynApiClient, input: YnabInput) {
  const days = input.days || 7;
  const data = await client.get<unknown>(
    `/api/v1/ynab/scheduled?days=${days}`
  );
  return jsonResult(data);
}

// Type for OpenClaw plugin API
interface OpenClawPluginApi {
  registerTool(tool: {
    id: string;
    name: string;
    description: string;
    inputSchema: unknown;
    execute: (input: unknown) => Promise<unknown>;
  }): void;
}

export function registerYnabTool(api: OpenClawPluginApi, client: MynApiClient): void {
  api.registerTool({
    id: 'myn_ynab',
    name: 'MYN YNAB',
    description: 'YNAB budget management. Actions: budget_overview, category_balance, account_balances, set_category_goal (TB/TBD/MF/NEED), spending_insights, upcoming_bills.',
    inputSchema: YnabInputSchema,
    async execute(input: unknown) {
      return executeYnab(client, input as YnabInput);
    }
  });
}

/**
 * myn_ynab tool - YNAB budget management
 *
 * Full coverage of MYN backend YNAB endpoints:
 * - Budget: overview, categories, accounts, months, payees, goals
 * - Transactions: create, create_bulk, list, update, delete
 * - Scheduled: list, create, update, delete, subscriptions view
 * - Analytics: spending, payees, trends, net worth, debt
 * - Connection: status check
 */

import { Type } from '@sinclair/typebox';
import type { MynApiClient } from '../client.js';
import { jsonResult, errorResult } from '../client.js';

export const YnabInputSchema = Type.Object({
  action: Type.Union([
    // Budget & accounts
    Type.Literal('budget_overview'),
    Type.Literal('category_balance'),
    Type.Literal('list_categories'),
    Type.Literal('account_balances'),
    Type.Literal('set_category_goal'),
    Type.Literal('goal_progress'),
    Type.Literal('budget_months'),
    Type.Literal('search_payees'),
    // Transactions
    Type.Literal('create_transaction'),
    Type.Literal('create_transactions_bulk'),
    Type.Literal('list_transactions'),
    Type.Literal('update_transaction'),
    Type.Literal('delete_transaction'),
    // Scheduled transactions & subscriptions
    Type.Literal('scheduled_transactions'),
    Type.Literal('create_scheduled_transaction'),
    Type.Literal('update_scheduled_transaction'),
    Type.Literal('delete_scheduled_transaction'),
    Type.Literal('subscriptions'),
    Type.Literal('upcoming_bills'),
    // Analytics
    Type.Literal('spending_insights'),
    Type.Literal('payee_analysis'),
    Type.Literal('spending_trends'),
    Type.Literal('net_worth'),
    Type.Literal('debt_tracking'),
    // Connection
    Type.Literal('connection_status')
  ]),

  // Shared parameters
  categoryName: Type.Optional(Type.String({ description: 'Category name (fuzzy match). Used by category_balance, set_category_goal, create_transaction, create_transactions_bulk.' })),
  accountId: Type.Optional(Type.String({ description: 'YNAB account ID. Use account_balances to find IDs.' })),
  payeeName: Type.Optional(Type.String({ description: 'Payee name. Used by create_transaction, create_transactions_bulk, search_payees, create_scheduled_transaction.' })),
  amount: Type.Optional(Type.Number({ description: 'Amount in dollars. Negative for expenses (e.g., -45.50), positive for income.' })),
  date: Type.Optional(Type.String({ description: 'Date in YYYY-MM-DD format. Defaults to today for transactions. Used as sinceDate filter for list_transactions.' })),
  memo: Type.Optional(Type.String({ description: 'Optional memo/note.' })),
  months: Type.Optional(Type.Number({ description: 'Number of months for analytics (default: 3 for spending, 6 for trends).' })),
  days: Type.Optional(Type.Number({ description: 'Number of days to look ahead for upcoming_bills (default: 7).' })),

  // Goal parameters
  goalType: Type.Optional(Type.String({ description: 'Goal type: TB (Target Balance), TBD (Target Balance by Date), MF (Monthly Funding), NEED (Plan Your Spending).' })),
  goalTargetDollars: Type.Optional(Type.Number({ description: 'Goal target in dollars (e.g., 500.00).' })),
  goalTargetMonth: Type.Optional(Type.String({ description: 'Target month YYYY-MM (e.g., 2026-06). Required for TBD goals.' })),

  // Scheduled transaction parameters
  transactionId: Type.Optional(Type.String({ description: 'Transaction ID. Required for update/delete_transaction and update/delete_scheduled_transaction.' })),
  cleared: Type.Optional(Type.String({ description: 'Cleared status: "cleared", "uncleared", or "reconciled". Used by update_transaction.' })),
  flagColor: Type.Optional(Type.String({ description: 'Flag color: red, orange, yellow, green, blue, purple. Used by update_transaction.' })),
  frequency: Type.Optional(Type.String({ description: 'Recurrence frequency: never, daily, weekly, everyOtherWeek, twiceAMonth, every4Weeks, monthly, everyOtherMonth, every3Months, every4Months, twiceAYear, yearly, everyOtherYear.' })),
  dateFirst: Type.Optional(Type.String({ description: 'First occurrence date YYYY-MM-DD for create_scheduled_transaction.' })),

  // Bulk transaction parameters
  transactions: Type.Optional(Type.Array(
    Type.Object({
      accountId: Type.String({ description: 'YNAB account ID.' }),
      payeeName: Type.String({ description: 'Payee name.' }),
      amount: Type.Number({ description: 'Amount in dollars. Negative for expenses.' }),
      categoryName: Type.Optional(Type.String({ description: 'Category name (fuzzy match).' })),
      date: Type.Optional(Type.String({ description: 'Date YYYY-MM-DD. Defaults to today.' })),
      memo: Type.Optional(Type.String({ description: 'Optional memo.' }))
    }),
    { description: 'Array of transactions for create_transactions_bulk.' }
  ))
});

export type YnabInput = typeof YnabInputSchema.static;

/**
 * Convert YNAB milliunits to formatted dollar string.
 * YNAB API returns all monetary amounts in milliunits (÷1000 for dollars).
 */
function formatDollars(milliunits: number): string {
  const dollars = milliunits / 1000;
  const abs = Math.abs(dollars);
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return dollars < 0 ? `-$${formatted}` : `$${formatted}`;
}

/** Known milliunit field names in YNAB API responses */
const MILLIUNIT_FIELDS = new Set([
  'readyToAssign', 'totalIncome', 'totalBudgeted', 'totalActivity',
  'balance', 'budgeted', 'activity', 'clearedBalance', 'unclearedBalance',
  'goalTarget', 'goalUnderFunded', 'goalOverFunded', 'goalOverallFunded', 'goalOverallLeft',
  'amount', 'total', 'totalSpending', 'monthlyTotal', 'annualTotal',
  'amountMilliunits', 'totalSpent', 'monthlyAverage'
]);

/**
 * Recursively convert milliunit fields to dollar strings in API responses.
 */
function convertMilliunits(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(convertMilliunits);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (MILLIUNIT_FIELDS.has(key) && typeof value === 'number') {
        result[key] = formatDollars(value);
      } else {
        result[key] = convertMilliunits(value);
      }
    }
    return result;
  }
  return obj;
}

/** Resolve a category name to its ID via fuzzy search. Returns null if not found. */
async function resolveCategoryId(client: MynApiClient, name: string): Promise<string | null> {
  const result = await client.get<{ id: string; name: string }>(
    `/api/v1/ynab/budget/categories/search?query=${encodeURIComponent(name)}`
  );
  return result?.id || null;
}

/** Today's date as YYYY-MM-DD */
function today(): string {
  return new Date().toISOString().split('T')[0];
}

export async function executeYnab(
  client: MynApiClient,
  input: YnabInput
): Promise<{ success: true; data: unknown } | { success: false; error: string; details?: unknown }> {
  try {
    switch (input.action) {
      // Budget & accounts
      case 'budget_overview':
        return jsonResult(convertMilliunits(await client.get('/api/v1/ynab/budget/overview')));
      case 'category_balance':
        return await getCategoryBalance(client, input);
      case 'list_categories':
        return jsonResult(convertMilliunits(await client.get('/api/v1/ynab/budget/categories')));
      case 'account_balances':
        return jsonResult(convertMilliunits(await client.get('/api/v1/ynab/budget/accounts')));
      case 'set_category_goal':
        return await setCategoryGoal(client, input);
      case 'goal_progress':
        return jsonResult(convertMilliunits(await client.get('/api/v1/ynab/budget/categories')));
      case 'budget_months':
        return jsonResult(convertMilliunits(await client.get('/api/v1/ynab/budget/months')));
      case 'search_payees':
        return await searchPayees(client, input);

      // Transactions
      case 'create_transaction':
        return await createTransaction(client, input);
      case 'create_transactions_bulk':
        return await createTransactionsBulk(client, input);
      case 'list_transactions':
        return await listTransactions(client, input);
      case 'update_transaction':
        return await updateTransaction(client, input);
      case 'delete_transaction':
        return await deleteTransactionAction(client, input);

      // Scheduled transactions & subscriptions
      case 'scheduled_transactions':
        return jsonResult(convertMilliunits(await client.get('/api/v1/ynab/scheduled-transactions')));
      case 'create_scheduled_transaction':
        return await createScheduledTransaction(client, input);
      case 'update_scheduled_transaction':
        return await updateScheduledTransaction(client, input);
      case 'delete_scheduled_transaction':
        return await deleteScheduledTransaction(client, input);
      case 'subscriptions':
        return jsonResult(convertMilliunits(await client.get('/api/v1/ynab/subscriptions')));
      case 'upcoming_bills': {
        const days = input.days || 7;
        return jsonResult(convertMilliunits(await client.get(`/api/v1/ynab/scheduled?days=${days}`)));
      }

      // Analytics
      case 'spending_insights': {
        const months = input.months || 3;
        return jsonResult(convertMilliunits(await client.get(`/api/v1/ynab/analytics/spending?months=${months}`)));
      }
      case 'payee_analysis': {
        const months = input.months || 3;
        return jsonResult(convertMilliunits(await client.get(`/api/v1/ynab/analytics/payees?months=${months}`)));
      }
      case 'spending_trends': {
        const months = input.months || 6;
        return jsonResult(convertMilliunits(await client.get(`/api/v1/ynab/analytics/trends?months=${months}`)));
      }
      case 'net_worth':
        return jsonResult(convertMilliunits(await client.get('/api/v1/ynab/analytics/net-worth')));
      case 'debt_tracking':
        return jsonResult(convertMilliunits(await client.get('/api/v1/ynab/analytics/debt')));

      // Connection
      case 'connection_status':
        return jsonResult(await client.get('/api/v1/ynab/status'));

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

// ==================== Action implementations ====================

async function getCategoryBalance(client: MynApiClient, input: YnabInput) {
  if (!input.categoryName) {
    return errorResult('categoryName is required for category_balance action');
  }
  const data = await client.get<unknown>(
    `/api/v1/ynab/budget/categories/search?query=${encodeURIComponent(input.categoryName)}`
  );
  return jsonResult(convertMilliunits(data));
}

async function searchPayees(client: MynApiClient, input: YnabInput) {
  if (input.payeeName) {
    const data = await client.get<unknown>(
      `/api/v1/ynab/budget/payees/search?query=${encodeURIComponent(input.payeeName)}`
    );
    return jsonResult(data);
  }
  // No search query — return all payees
  const data = await client.get<unknown>('/api/v1/ynab/budget/payees');
  return jsonResult(data);
}

async function setCategoryGoal(client: MynApiClient, input: YnabInput) {
  if (!input.categoryName) {
    return errorResult('categoryName is required for set_category_goal action');
  }
  if (!input.goalType) {
    return errorResult('goalType is required for set_category_goal action (TB, TBD, MF, NEED)');
  }

  const categoryId = await resolveCategoryId(client, input.categoryName);
  if (!categoryId) {
    return errorResult(`Category '${input.categoryName}' not found`);
  }

  let goalTargetMonth = input.goalTargetMonth;
  if (goalTargetMonth && !goalTargetMonth.endsWith('-01')) {
    goalTargetMonth = goalTargetMonth + '-01';
  }

  const body: Record<string, unknown> = { goalType: input.goalType };
  if (input.goalTargetDollars != null) body.goalTargetDollars = input.goalTargetDollars;
  if (goalTargetMonth) body.goalTargetMonth = goalTargetMonth;

  const data = await client.patch<unknown>(`/api/v1/ynab/budget/categories/${categoryId}/goal`, body);
  return jsonResult(convertMilliunits(data));
}

async function createTransaction(client: MynApiClient, input: YnabInput) {
  if (!input.accountId) {
    return errorResult('accountId is required for create_transaction. Use account_balances to find IDs.');
  }
  if (!input.payeeName) {
    return errorResult('payeeName is required for create_transaction.');
  }
  if (input.amount == null) {
    return errorResult('amount is required for create_transaction (in dollars, negative for expenses).');
  }

  const amountMilliunits = Math.round(input.amount * 1000);

  let categoryId: string | undefined;
  if (input.categoryName) {
    const resolved = await resolveCategoryId(client, input.categoryName);
    if (!resolved) {
      return errorResult(`Category '${input.categoryName}' not found. Use list_categories to browse.`);
    }
    categoryId = resolved;
  }

  // YNAB API defaults to "uncleared" when cleared status not specified
  const body: Record<string, unknown> = {
    accountId: input.accountId,
    payeeName: input.payeeName,
    amountMilliunits,
    date: input.date || today()
  };
  if (input.memo) body.memo = input.memo;
  if (categoryId) body.categoryId = categoryId;

  const data = await client.post<unknown>('/api/v1/ynab/transactions', body);
  return jsonResult(convertMilliunits(data));
}

async function createTransactionsBulk(client: MynApiClient, input: YnabInput) {
  if (!input.transactions || input.transactions.length === 0) {
    return errorResult('transactions array is required for create_transactions_bulk. Each needs accountId, payeeName, amount.');
  }

  // Resolve category names and convert amounts for all transactions
  const resolved = [];
  for (const txn of input.transactions) {
    const amountMilliunits = Math.round(txn.amount * 1000);

    let categoryId: string | undefined;
    if (txn.categoryName) {
      const id = await resolveCategoryId(client, txn.categoryName);
      if (!id) {
        return errorResult(`Category '${txn.categoryName}' not found for transaction "${txn.payeeName}". Use list_categories to browse.`);
      }
      categoryId = id;
    }

    const entry: Record<string, unknown> = {
      accountId: txn.accountId,
      payeeName: txn.payeeName,
      amount: amountMilliunits,
      date: txn.date || today()
    };
    if (txn.memo) entry.memo = txn.memo;
    if (categoryId) entry.categoryId = categoryId;
    resolved.push(entry);
  }

  const data = await client.post<unknown>('/api/v1/ynab/transactions/bulk', { transactions: resolved });
  return jsonResult(data);
}

async function listTransactions(client: MynApiClient, input: YnabInput) {
  const params = input.date ? `?sinceDate=${encodeURIComponent(input.date)}` : '';
  const data = await client.get<unknown>(`/api/v1/ynab/transactions${params}`);
  return jsonResult(convertMilliunits(data));
}

async function updateTransaction(client: MynApiClient, input: YnabInput) {
  if (!input.transactionId) {
    return errorResult('transactionId is required for update_transaction.');
  }

  const body: Record<string, unknown> = {};
  if (input.accountId) body.accountId = input.accountId;
  if (input.payeeName) body.payeeName = input.payeeName;
  if (input.amount != null) body.amountMilliunits = Math.round(input.amount * 1000);
  if (input.date) body.date = input.date;
  if (input.memo) body.memo = input.memo;
  if (input.cleared) body.cleared = input.cleared;
  if (input.flagColor) body.flagColor = input.flagColor;

  if (input.categoryName) {
    const categoryId = await resolveCategoryId(client, input.categoryName);
    if (!categoryId) {
      return errorResult(`Category '${input.categoryName}' not found.`);
    }
    body.categoryId = categoryId;
  }

  const data = await client.put<unknown>(`/api/v1/ynab/transactions/${input.transactionId}`, body);
  return jsonResult(convertMilliunits(data));
}

async function deleteTransactionAction(client: MynApiClient, input: YnabInput) {
  if (!input.transactionId) {
    return errorResult('transactionId is required for delete_transaction.');
  }
  const data = await client.delete<unknown>(`/api/v1/ynab/transactions/${input.transactionId}`);
  return jsonResult(convertMilliunits(data));
}

async function createScheduledTransaction(client: MynApiClient, input: YnabInput) {
  if (!input.accountId) {
    return errorResult('accountId is required for create_scheduled_transaction.');
  }
  if (!input.payeeName) {
    return errorResult('payeeName is required for create_scheduled_transaction.');
  }
  if (input.amount == null) {
    return errorResult('amount is required for create_scheduled_transaction (in dollars).');
  }
  if (!input.frequency) {
    return errorResult('frequency is required (e.g., monthly, weekly, yearly).');
  }
  if (!input.dateFirst) {
    return errorResult('dateFirst is required (YYYY-MM-DD, first occurrence date).');
  }

  const amountMilliunits = Math.round(input.amount * 1000);

  let categoryId: string | undefined;
  if (input.categoryName) {
    const resolved = await resolveCategoryId(client, input.categoryName);
    if (!resolved) {
      return errorResult(`Category '${input.categoryName}' not found.`);
    }
    categoryId = resolved;
  }

  const body: Record<string, unknown> = {
    accountId: input.accountId,
    payeeName: input.payeeName,
    amountMilliunits,
    dateFirst: input.dateFirst,
    dateNext: input.dateFirst,
    frequency: input.frequency
  };
  if (input.memo) body.memo = input.memo;
  if (categoryId) body.categoryId = categoryId;

  const data = await client.post<unknown>('/api/v1/ynab/scheduled-transactions', body);
  return jsonResult(convertMilliunits(data));
}

async function updateScheduledTransaction(client: MynApiClient, input: YnabInput) {
  if (!input.transactionId) {
    return errorResult('transactionId is required for update_scheduled_transaction.');
  }

  const body: Record<string, unknown> = {};
  if (input.payeeName) body.payeeName = input.payeeName;
  if (input.amount != null) body.amountMilliunits = Math.round(input.amount * 1000);
  if (input.date) body.dateNext = input.date;
  if (input.frequency) body.frequency = input.frequency;
  if (input.memo) body.memo = input.memo;

  if (input.categoryName) {
    const categoryId = await resolveCategoryId(client, input.categoryName);
    if (!categoryId) {
      return errorResult(`Category '${input.categoryName}' not found.`);
    }
    body.categoryId = categoryId;
  }

  const data = await client.put<unknown>(`/api/v1/ynab/scheduled-transactions/${input.transactionId}`, body);
  return jsonResult(convertMilliunits(data));
}

async function deleteScheduledTransaction(client: MynApiClient, input: YnabInput) {
  if (!input.transactionId) {
    return errorResult('transactionId is required for delete_scheduled_transaction.');
  }
  const data = await client.delete<unknown>(`/api/v1/ynab/scheduled-transactions/${input.transactionId}`);
  return jsonResult(data);
}

// ==================== OpenClaw plugin registration ====================

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
    description: [
      'YNAB budget management with full read/write access.',
      'Budget: budget_overview, category_balance, list_categories, account_balances, set_category_goal, goal_progress, budget_months, search_payees.',
      'Transactions: create_transaction, create_transactions_bulk, list_transactions, update_transaction, delete_transaction.',
      'Scheduled: scheduled_transactions, create_scheduled_transaction, update_scheduled_transaction, delete_scheduled_transaction, subscriptions, upcoming_bills.',
      'Analytics: spending_insights, payee_analysis, spending_trends, net_worth, debt_tracking.',
      'Connection: connection_status.',
      'Amounts in dollars (negative=expense). Categories resolved by name (fuzzy match).'
    ].join(' '),
    inputSchema: YnabInputSchema,
    async execute(input: unknown) {
      return executeYnab(client, input as YnabInput);
    }
  });
}

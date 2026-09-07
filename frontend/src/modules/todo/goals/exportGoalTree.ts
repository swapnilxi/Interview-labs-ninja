import { GoalNode, GOAL_LEVELS } from '@/lib/services/goalService';

const LEVEL_LABEL = new Map(GOAL_LEVELS.map((l) => [l.id, l.label]));

function collectSubtree(root: GoalNode, byId: Map<number, GoalNode>): Array<GoalNode & { depth: number }> {
  const rows: Array<GoalNode & { depth: number }> = [];
  const stack: Array<{ node: GoalNode; depth: number }> = [{ node: root, depth: 0 }];

  while (stack.length) {
    const { node, depth } = stack.pop()!;
    rows.push({ ...node, depth });
    const children = Array.from(byId.values())
      .filter((n) => n.parent_id === node.id)
      .sort((a, b) => a.order_index - b.order_index || a.id - b.id);
    for (const child of children.reverse()) stack.push({ node: child, depth: depth + 1 });
  }
  return rows;
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Exports a goal and its full descendant breakdown (all time-horizon levels) as a CSV file
 *  the user can open in Excel or import into Google Sheets — no server round-trip needed. */
export function exportGoalTreeToCsv(root: GoalNode, byId: Map<number, GoalNode>): void {
  const rows = collectSubtree(root, byId);
  const header = ['Level', 'Title', 'Description', 'Status', 'Priority', 'Due Date', 'Parent Goal'];
  const lines = [header.map(csvEscape).join(',')];

  for (const node of rows) {
    const indent = '— '.repeat(node.depth);
    const parent = node.parent_id != null ? byId.get(node.parent_id)?.title || '' : '';
    lines.push(
      [
        LEVEL_LABEL.get(node.level) || node.level,
        indent + node.title,
        node.description || '',
        node.status,
        node.priority.toUpperCase(),
        node.due_date || '',
        parent,
      ]
        .map((v) => csvEscape(String(v)))
        .join(',')
    );
  }

  const csv = lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${root.title.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 60) || 'goal'}_breakdown.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Paginator — Page navigation for listings
 */

export function Paginator({ pagination }: { pagination: any }) {
  if (!pagination || pagination.total <= 1) return null

  return (
    <nav class="paginator">
      {pagination.prev
        ? <a class="prev" href={pagination.prev}>← 上一页</a>
        : <span class="prev disabled">← 上一页</span>
      }
      <span class="page-info">{pagination.current} / {pagination.total}</span>
      {pagination.next
        ? <a class="next" href={pagination.next}>下一页 →</a>
        : <span class="next disabled">下一页 →</span>
      }
    </nav>
  )
}

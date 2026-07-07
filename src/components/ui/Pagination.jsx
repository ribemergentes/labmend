import { ChevronLeft, ChevronRight } from 'lucide-react'

const SIZES = [25, 50, 100]

/**
 * Barra de paginación para listados largos.
 * Uso: paginar en cliente con slice((page-1)*pageSize, page*pageSize).
 */
export default function Pagination({ total, page, pageSize, onPage, onPageSize }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to   = Math.min(page * pageSize, total)

  if (total <= SIZES[0]) return null

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex-wrap">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Mostrando <span className="font-bold text-slate-700 dark:text-slate-200">{from}–{to}</span> de{' '}
        <span className="font-bold text-slate-700 dark:text-slate-200">{total}</span>
      </p>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          Por página
          <select
            value={pageSize}
            onChange={e => { onPageSize(Number(e.target.value)); onPage(1) }}
            className="px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
            {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>

        <div className="flex items-center gap-1">
          <button
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Página anterior">
            <ChevronLeft size={14}/>
          </button>
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300 px-2 whitespace-nowrap">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Página siguiente">
            <ChevronRight size={14}/>
          </button>
        </div>
      </div>
    </div>
  )
}

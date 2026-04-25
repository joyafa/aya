import { useCallback, useRef } from 'react'

/**
 * 首字母快速定位 hook
 * @param items 数据列表
 * @param getName 从列表项获取用于匹配的名称
 */
export default function useQuickLocate<T>(
  items: T[],
  getName: (item: T) => string
) {
  const searchBufferRef = useRef('')
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  return useCallback(
    (
      e: React.KeyboardEvent,
      container: HTMLElement,
      options?: {
        /** 从 DataGrid 节点 data 中识别匹配项，默认用 === 比较 */
        matchNodeData?: (data: any, item: T) => boolean
      }
    ) => {
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) {
        return
      }
      e.preventDefault()

      clearTimeout(searchTimerRef.current)
      searchBufferRef.current += e.key.toLowerCase()
      const prefix = searchBufferRef.current
      searchTimerRef.current = setTimeout(() => {
        searchBufferRef.current = ''
      }, 500)

      const match = items.find((item) =>
        getName(item).toLowerCase().startsWith(prefix)
      )
      if (!match) {
        return
      }

      const matchNode =
        options?.matchNodeData ?? ((data: any, item: T) => data === item)

      // DataGrid 列表视图：虚拟滚动定位
      const dataContainer = container.querySelector(
        '.luna-data-grid-data-container'
      ) as HTMLElement | null
      if (dataContainer) {
        const idx = items.indexOf(match)
        if (idx >= 0) {
          dataContainer.scrollTop = idx * 20
          setTimeout(() => {
            const rows = dataContainer.querySelectorAll('tr')
            for (const row of rows) {
              const node = (row as any).dataGridNode
              if (node && matchNode(node.data, match)) {
                ;(row as HTMLElement).click()
                return
              }
            }
          }, 50)
        }
        return
      }

      // 图标视图：查找 DOM 元素定位
      const iconItems = container.querySelectorAll('.luna-icon-list-item')
      for (const el of iconItems) {
        const icon = (el as any).icon
        if (icon?.data && matchNode(icon.data, match)) {
          ;(el as HTMLElement).click()
          el.scrollIntoView({ block: 'nearest' })
          return
        }
      }
    },
    [items, getName]
  )
}

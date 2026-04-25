import { observer } from 'mobx-react-lite'
import Style from './Transfer.module.scss'
import LunaDataGrid from 'luna-data-grid/react'
import { t } from 'common/util'
import { useRef, useEffect } from 'react'
import DataGrid from 'luna-data-grid'
import { useResizeSensor } from 'share/renderer/lib/hooks'
import store from '../../store'
import map from 'licia/map'
import { TransferType } from 'common/types'
import durationFormat from 'licia/durationFormat'
import fileSize from 'licia/fileSize'
import toEl from 'licia/toEl'
import contextMenu from 'share/renderer/lib/contextMenu'

export default observer(function Transfer() {
  const containerRef = useRef<HTMLDivElement>(null)
  const dataGridRef = useRef<DataGrid>(null)

  useResizeSensor(containerRef, () => {
    dataGridRef.current?.fit()
  })

  const handleActionClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    const action = target.dataset.action
    const id = target.dataset.id
    if (!action || !id) return

    if (action === 'pause') {
      main.pauseTransfer(id)
    } else if (action === 'resume') {
      main.resumeTransfer(id)
    } else if (action === 'cancel') {
      main.cancelTransfer(id)
    }
  }

  const data = map(store.file.transfers, (transfer) => {
    const percent =
      transfer.size > 0
        ? Math.round((transfer.transferred / transfer.size) * 100)
        : 0

    return {
      id: transfer.id,
      type:
        transfer.type === TransferType.Download ? t('download') : t('upload'),
      name: transfer.name,
      progress: toEl(
        `<div class="${Style.progressWrap}">` +
          `<div class="${Style.progressBar}" style="width:${percent}%"></div>` +
          `<span class="${Style.progressText}">${percent}%</span>` +
          `</div>`
      ),
      size: `${fileSize(transfer.transferred)}/${fileSize(transfer.size)}`,
      duration: durationFormat(Math.round(transfer.duration), 'h:m:s:l'),
      actions: toEl(
        `<div class="${Style.actions}">` +
          (transfer.paused
            ? `<span class="${Style.actionBtn} ${Style.resume}" data-action="resume" data-id="${transfer.id}" title="${t('resume')}">▶</span>`
            : `<span class="${Style.actionBtn} ${Style.pause}" data-action="pause" data-id="${transfer.id}" title="${t('pause')}">⏸</span>`) +
          `<span class="${Style.actionBtn} ${Style.cancel}" data-action="cancel" data-id="${transfer.id}" title="${t('cancel')}">✕</span>` +
          `</div>`
      ),
    }
  })

  const onRowContextMenu = (e: MouseEvent, row: any) => {
    e.preventDefault()
    const transfer = store.file.transfers.find((t) => t.id === row.id)
    if (!transfer) return

    const template = [
      {
        label: transfer.paused ? t('resume') : t('pause'),
        click: () => {
          if (transfer.paused) {
            main.resumeTransfer(transfer.id)
          } else {
            main.pauseTransfer(transfer.id)
          }
        },
      },
      {
        label: t('cancel'),
        click: () => {
          main.cancelTransfer(transfer.id)
        },
      },
    ]
    contextMenu(e, template)
  }

  return (
    <div className={Style.container} ref={containerRef} onClick={handleActionClick}>
      <LunaDataGrid
        columns={columns}
        data={data}
        uniqueId="id"
        onCreate={(dataGrid) => {
          dataGridRef.current = dataGrid
          dataGrid.fit()
        }}
        onContextMenu={onRowContextMenu}
      />
    </div>
  )
})

const columns = [
  {
    id: 'type',
    title: t('type'),
    weight: 8,
  },
  {
    id: 'name',
    title: t('name'),
    weight: 25,
  },
  {
    id: 'progress',
    title: t('progress'),
    weight: 22,
  },
  {
    id: 'size',
    title: t('size'),
    weight: 18,
  },
  {
    id: 'actions',
    title: '',
    weight: 8,
  },
]

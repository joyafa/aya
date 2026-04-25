import { observer } from 'mobx-react-lite'
import LunaToolbar, {
  LunaToolbarSelect,
  LunaToolbarSeparator,
  LunaToolbarSpace,
  LunaToolbarHtml,
} from 'luna-toolbar/react'
import LunaLogcat from 'luna-logcat/react'
import Logcat from 'luna-logcat'
import map from 'licia/map'
import rpad from 'licia/rpad'
import dateFormat from 'licia/dateFormat'
import toNum from 'licia/toNum'
import trim from 'licia/trim'
import contain from 'licia/contain'
import lowerCase from 'licia/lowerCase'
import { useEffect, useRef, useState } from 'react'
import store from '../../store'
import copy from 'licia/copy'
import download from 'licia/download'
import toStr from 'licia/toStr'
import { t } from 'common/util'
import ToolbarIcon from 'share/renderer/components/ToolbarIcon'
import contextMenu from 'share/renderer/lib/contextMenu'
import FilterInput from './FilterInput'
import logcatStyles from './logcat.module.scss'

export default observer(function Logcat() {
  const [view, setView] = useState<'compact' | 'standard'>('standard')
  const [softWrap, setSoftWrap] = useState(false)
  const [paused, setPaused] = useState(false)
  const [filter, setFilter] = useState<{
    priority?: number
    package?: string
    tag?: string
    keyword?: string
  }>({})
  const [filterHistory, setFilterHistory] = useState<{
    package: string[]
    tag: string[]
    keyword: string[]
  }>({
    package: [],
    tag: [],
    keyword: [],
  })
  const logcatRef = useRef<Logcat>(null)
  const entriesRef = useRef<any[]>([])
  const logcatIdRef = useRef('')

  const { device } = store

  // 加载历史记录
  useEffect(() => {
    const saved = localStorage.getItem('logcat-filter-history')
    if (saved) {
      try {
        setFilterHistory(JSON.parse(saved))
      } catch (e) {
        // ignore
      }
    }
  }, [])

  // 保存历史记录
  function saveToHistory(type: 'package' | 'tag' | 'keyword', value: string) {
    if (!value || value.trim() === '') return
    const trimmed = value.trim()
    setFilterHistory((prev) => {
      const newList = [trimmed, ...prev[type].filter((v) => v !== trimmed)].slice(
        0,
        10
      )
      const newHistory = { ...prev, [type]: newList }
      localStorage.setItem('logcat-filter-history', JSON.stringify(newHistory))
      return newHistory
    })
  }

  // 删除历史记录
  function deleteFromHistory(type: 'package' | 'tag' | 'keyword', value: string) {
    setFilterHistory((prev) => {
      const newList = prev[type].filter((v) => v !== value)
      const newHistory = { ...prev, [type]: newList }
      localStorage.setItem('logcat-filter-history', JSON.stringify(newHistory))
      return newHistory
    })
  }

  // 处理输入框变化
  function handleFilterChange(
    type: 'package' | 'tag' | 'keyword',
    value: string
  ) {
    setFilter({ ...filter, [type]: value || undefined })
  }

  // 处理提交（按回车或选择历史记录）
  function handleFilterCommit(
    type: 'package' | 'tag' | 'keyword',
    value: string
  ) {
    saveToHistory(type, value)
  }

  useEffect(() => {
    function onLogcatEntry(id, entry) {
      if (logcatIdRef.current !== id) {
        return
      }
      entriesRef.current.push(entry)
      if (logcatRef.current) {
        // 应用所有过滤条件
        if (
          (filter.priority !== undefined && entry.priority < filter.priority) ||
          (filter.package && entry.package !== filter.package) ||
          (filter.tag && entry.tag !== filter.tag) ||
          (filter.keyword &&
            !contain(lowerCase(entry.message), lowerCase(filter.keyword)) &&
            !contain(lowerCase(entry.tag), lowerCase(filter.keyword)))
        ) {
          return
        }
        logcatRef.current.append(entry)
      }
    }
    const offLogcatEntry = main.on('logcatEntry', onLogcatEntry)
    if (device) {
      main.openLogcat(device.id).then((id) => {
        logcatIdRef.current = id
      })
    }

    return () => {
      offLogcatEntry()
      if (logcatIdRef.current) {
        main.closeLogcat(logcatIdRef.current)
      }
    }
  }, [filter, device])

  useEffect(() => {
    const logcat = logcatRef.current
    if (!logcat) return
    logcat.clear()
    for (const entry of entriesRef.current) {
      // 应用所有过滤条件
      if (
        (filter.priority !== undefined && entry.priority < filter.priority) ||
        (filter.package && entry.package !== filter.package) ||
        (filter.tag && entry.tag !== filter.tag) ||
        (filter.keyword &&
          !contain(lowerCase(entry.message), lowerCase(filter.keyword)) &&
          !contain(lowerCase(entry.tag), lowerCase(filter.keyword)))
      ) {
        continue
      }
      logcat.append(entry)
    }
  }, [filter])

  if (store.panel !== 'logcat') {
    if (!paused && logcatIdRef.current) {
      main.pauseLogcat(logcatIdRef.current)
    }
  } else {
    if (!paused && logcatIdRef.current) {
      main.resumeLogcat(logcatIdRef.current)
    }
  }

  function save() {
    const data = map(entriesRef.current, (entry) => {
      return trim(
        `${dateFormat(entry.date, 'mm-dd HH:MM:ss.l')} ${rpad(
          entry.pid,
          5,
          ' '
        )} ${rpad(entry.tid, 5, ' ')} ${toLetter(entry.priority)} ${
          entry.tag
        }: ${entry.message}`
      )
    }).join('\n')
    const name = `${store.device ? store.device.name : 'logcat'}.${dateFormat(
      'yyyymmddHH'
    )}.txt`

    download(data, name, 'text/plain')
  }

  function clear() {
    if (logcatRef.current) {
      logcatRef.current.clear()
    }
    entriesRef.current = []
  }

  const onContextMenu = (e: PointerEvent, entry: any) => {
    e.preventDefault()
    const logcat = logcatRef.current!
    const template: any[] = [
      {
        label: t('copy'),
        click: () => {
          if (logcat.hasSelection()) {
            copy(logcat.getSelection())
          } else if (entry) {
            copy(entry.message)
          }
        },
      },
      {
        type: 'separator',
      },
      {
        label: t('clear'),
        click: clear,
      },
    ]

    contextMenu(e, template)
  }

  return (
    <div className="panel-with-toolbar">
      <LunaToolbar
        className="panel-toolbar"
        onChange={(key, val) => {
          switch (key) {
            case 'view':
              setView(val)
              break
            case 'priority':
              setFilter({
                ...filter,
                priority: toNum(val),
              })
              break
          }
        }}
      >
        <LunaToolbarSelect
          keyName="view"
          disabled={!device}
          value={view}
          options={{
            [t('standardView')]: 'standard',
            [t('compactView')]: 'compact',
          }}
        />
        <LunaToolbarSeparator />
        <LunaToolbarSelect
          keyName="priority"
          disabled={!device}
          value={toStr(filter.priority || 2)}
          options={{
            VERBOSE: '2',
            DEBUG: '3',
            INFO: '4',
            WARNING: '5',
            ERROR: '6',
          }}
        />
        <LunaToolbarHtml
          className={logcatStyles.filterInputContainer}
          disabled={!device}
        >
          <FilterInput
            type="package"
            placeholder={t('package')}
            value={filter.package || ''}
            history={filterHistory.package}
            onChange={(val) => handleFilterChange('package', val)}
            onCommit={(val) => handleFilterCommit('package', val)}
            onDeleteHistory={(val) => deleteFromHistory('package', val)}
          />
          <FilterInput
            type="tag"
            placeholder={t('tag')}
            value={filter.tag || ''}
            history={filterHistory.tag}
            onChange={(val) => handleFilterChange('tag', val)}
            onCommit={(val) => handleFilterCommit('tag', val)}
            onDeleteHistory={(val) => deleteFromHistory('tag', val)}
          />
          <FilterInput
            type="keyword"
            placeholder={t('keyword')}
            value={filter.keyword || ''}
            history={filterHistory.keyword}
            onChange={(val) => handleFilterChange('keyword', val)}
            onCommit={(val) => handleFilterCommit('keyword', val)}
            onDeleteHistory={(val) => deleteFromHistory('keyword', val)}
          />
        </LunaToolbarHtml>
        <ToolbarIcon
          icon="close"
          title={t('clearFilter')}
          onClick={() => setFilter({})}
        />
        <LunaToolbarSpace />
        <ToolbarIcon
          icon="save"
          title={t('save')}
          onClick={save}
          disabled={!device}
        />
        <LunaToolbarSeparator />
        <ToolbarIcon
          icon="soft-wrap"
          state={softWrap ? 'hover' : ''}
          title={t('softWrap')}
          onClick={() => setSoftWrap(!softWrap)}
        />
        <ToolbarIcon
          icon="scroll-end"
          title={t('scrollToEnd')}
          onClick={() => logcatRef.current?.scrollToEnd()}
          disabled={!device}
        />
        <ToolbarIcon
          icon="reset"
          title={t('restart')}
          onClick={() => {
            if (logcatIdRef.current) {
              main.closeLogcat(logcatIdRef.current)
              clear()
            }
            if (device) {
              main.openLogcat(device.id).then((id) => {
                logcatIdRef.current = id
              })
            }
          }}
          disabled={!device}
        />
        <ToolbarIcon
          icon={paused ? 'play' : 'pause'}
          title={t(paused ? 'resume' : 'pause')}
          onClick={() => {
            if (paused) {
              main.resumeLogcat(logcatIdRef.current)
            } else {
              main.pauseLogcat(logcatIdRef.current)
            }
            setPaused(!paused)
          }}
          disabled={!device}
        />
        <LunaToolbarSeparator />
        <ToolbarIcon
          icon="delete"
          title={t('clear')}
          onClick={clear}
          disabled={!device}
        />
      </LunaToolbar>
      <LunaLogcat
        className="panel-body"
        maxNum={10000}
        wrapLongLines={softWrap}
        onContextMenu={onContextMenu}
        view={view}
        onCreate={(logcat) => (logcatRef.current = logcat)}
      />
    </div>
  )
})

function toLetter(priority: number) {
  return ['?', '?', 'V', 'D', 'I', 'W', 'E'][priority]
}

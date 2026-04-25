import { observer } from 'mobx-react-lite'
import LunaToolbar, {
  LunaToolbarHtml,
  LunaToolbarInput,
  LunaToolbarSeparator,
} from 'luna-toolbar/react'
import LunaFileList from 'luna-file-list/react'
import ToolbarIcon from 'share/renderer/components/ToolbarIcon'
import { useCallback, useEffect, useRef, useState } from 'react'
import Style from './File.module.scss'
import store from '../../store'
import { t } from 'common/util'
import { notify, isFileDrop } from 'share/renderer/lib/util'
import { IFile } from 'luna-file-list'
import className from 'licia/className'
import isEmpty from 'licia/isEmpty'
import splitPath from 'licia/splitPath'
import contextMenu from 'share/renderer/lib/contextMenu'
import LunaModal from 'luna-modal'
import endWith from 'licia/endWith'
import normalizePath from 'licia/normalizePath'
import LunaPathBar from 'luna-path-bar/react'
import startWith from 'licia/startWith'
import LunaSplitPane, { LunaSplitPaneItem } from 'luna-split-pane/react'
import Transfer from './Transfer'
import FilePreview from 'share/renderer/components/FilePreview'
import useQuickLocate from '../../lib/useQuickLocate'

export default observer(function File() {
  const [fileList, setFileList] = useState<IFile[]>([])
  const [path, setPath] = useState('')
  const [customPath, setCustomPath] = useState('')
  const [filter, setFilter] = useState('')
  const [dropHighlight, setDropHighlight] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const [selected, setSelected] = useState<IFile | undefined>()
  const [selectedUrl, setSelectedUrl] = useState<string>('')
  const [selectedFiles, setSelectedFiles] = useState<IFile[]>([])
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'mtime' | 'type'>('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const draggingRef = useRef(0)
  const fileListContainerRef = useRef<HTMLDivElement>(null)
  const clipboardRef = useRef<{ type: 'copy' | 'cut'; files: IFile[]; srcPath: string } | null>(null)

  const { device, file } = store

  const quickLocate = useQuickLocate(fileList, (f: IFile) => f.name)

  const openRef = useRef<(f: IFile) => void>()
  openRef.current = open

  const handleFileListKeyDown = useCallback(
    async (e: React.KeyboardEvent) => {
      if (!fileListContainerRef.current) return

      // Enter: 打开文件/目录
      if (e.key === 'Enter' && selected) {
        openRef.current?.(selected)
        return
      }

      // Delete: 删除选中文件
      if (e.key === 'Delete' && selected) {
        e.preventDefault()
        const filesToDelete = selectedFiles.length > 0 ? selectedFiles : [selected]
        const result = await LunaModal.confirm(
          filesToDelete.length === 1
            ? t('deleteFileConfirm', { name: filesToDelete[0].name })
            : t('deleteMultipleConfirm', { count: filesToDelete.length })
        )
        if (result) {
          for (const f of filesToDelete) {
            const filePath = path + f.name
            if (f.directory) {
              await main.deleteDir(device!.id, filePath)
            } else {
              await main.deleteFile(device!.id, filePath)
            }
          }
          getFiles(path)
        }
        return
      }

      // F2: 重命名
      if (e.key === 'F2' && selected) {
        e.preventDefault()
        const name = await LunaModal.prompt(
          t(selected.directory ? 'newFolderName' : 'newFileName'),
          selected.name
        )
        if (name && name !== selected.name) {
          if (fileExist(name)) {
            notify(t('fileExistErr', { name }), { icon: 'error' })
            return
          }
          await main.moveFile(device!.id, path + selected.name, path + name)
          getFiles(path)
        }
        return
      }

      // Ctrl+C: 复制
      if (e.key === 'c' && (e.ctrlKey || e.metaKey) && selected) {
        e.preventDefault()
        clipboardRef.current = {
          type: 'copy',
          files: selectedFiles.length > 0 ? selectedFiles : [selected],
          srcPath: path,
        }
        notify(
          t('copiedToClipboard', { count: clipboardRef.current.files.length }),
          { icon: 'success' }
        )
        return
      }

      // Ctrl+X: 剪切
      if (e.key === 'x' && (e.ctrlKey || e.metaKey) && selected) {
        e.preventDefault()
        clipboardRef.current = {
          type: 'cut',
          files: selectedFiles.length > 0 ? selectedFiles : [selected],
          srcPath: path,
        }
        notify(
          t('cutToClipboard', { count: clipboardRef.current.files.length }),
          { icon: 'success' }
        )
        return
      }

      // Ctrl+V: 粘贴
      if (e.key === 'v' && (e.ctrlKey || e.metaKey) && clipboardRef.current) {
        e.preventDefault()
        const { type, files, srcPath } = clipboardRef.current
        for (const file of files) {
          const srcFilePath = srcPath + file.name
          const destFilePath = path + file.name
          if (type === 'copy') {
            if (file.directory) {
              await main.copyDir(device!.id, srcFilePath, destFilePath)
            } else {
              const tmpDir = await main.getTmpdir()
              const tmpPath = tmpDir + '/' + file.name
              await main.pullFile(device!.id, srcFilePath, tmpPath)
              await main.pushFile(device!.id, tmpPath, destFilePath)
            }
          } else if (type === 'cut') {
            await main.moveFile(device!.id, srcFilePath, destFilePath)
          }
        }
        if (type === 'cut') {
          clipboardRef.current = null
        }
        getFiles(path)
        return
      }

      // A: 全选
      if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setSelectedFiles([...fileList])
        return
      }

      // Escape: 取消选择
      if (e.key === 'Escape') {
        setSelectedFiles([])
        return
      }

      quickLocate(e, fileListContainerRef.current, {
        matchNodeData: (data: any, f: IFile) => data.file === f,
      })
    },
    [quickLocate, selected, selectedFiles, path, device, fileList]
  )

  useEffect(() => {
    go('/')
  }, [])

  function sortFiles(files: IFile[]): IFile[] {
    const sorted = [...files].sort((a, b) => {
      // 目录始终排在前面
      if (a.directory !== b.directory) {
        return a.directory ? -1 : 1
      }
      let cmp = 0
      switch (sortBy) {
        case 'name':
          cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
          break
        case 'size':
          cmp = (a.size || 0) - (b.size || 0)
          break
        case 'mtime':
          cmp = new Date(a.mtime).getTime() - new Date(b.mtime).getTime()
          break
        case 'type':
          cmp = splitPath(a.name).ext.localeCompare(splitPath(b.name).ext)
          break
      }
      return sortOrder === 'asc' ? cmp : -cmp
    })
    return sorted
  }

  async function getFiles(path: string) {
    if (device) {
      const files: IFile[] = await main.readDir(device.id, path)
      for (let i = 0, len = files.length; i < len; i++) {
        const f = files[i]
        if (!f.directory) {
          const ext = splitPath(f.name).ext
          const type = f.mime
          if (
            !type ||
            (!startWith(type, 'image') &&
              !startWith(type, 'text') &&
              !startWith(type, 'video') &&
              !startWith(type, 'audio'))
          ) {
            f.thumbnail = await main.getFileIcon(ext)
          }
        }
      }
      setPath(path)
      setCustomPath(path)
      setFileList(sortFiles(files))
      setFilter('')
      setSelectedFiles([])
    }
  }

  function fileExist(name: string) {
    for (let i = 0, len = fileList.length; i < len; i++) {
      if (fileList[i].name === name) {
        return true
      }
    }

    return false
  }

  async function back() {
    if (historyIdx <= 0) {
      return
    }
    await getFiles(history[historyIdx - 1])
    setHistoryIdx(historyIdx - 1)
  }

  async function forward() {
    if (historyIdx >= history.length - 1) {
      return
    }
    await getFiles(history[historyIdx + 1])
    setHistoryIdx(historyIdx + 1)
  }

  async function go(p: string) {
    await getFiles(p)
    setHistory([...history.slice(0, historyIdx + 1), p])
    setHistoryIdx(historyIdx + 1)
  }

  async function up() {
    await go(path.split('/').slice(0, -2).join('/') + '/')
  }

  async function open(f: IFile) {
    if (!device) {
      return
    }

    if (f.directory) {
      go(path + f.name + '/')
      return
    }

    const ext = splitPath(f.name).ext.toLowerCase()
    const isLogFile = ext === '.log' || ext === '.txt'
    const isZipFile = ext === '.zip'

    const fullPath = path + f.name

    // zip/log/txt 文件用系统程序打开
    if (isZipFile) {
      notify(t('openingWithZipTool', { path: fullPath }), {
        icon: 'info',
      })
      try {
        await main.openFile(device.id, fullPath)
      } catch (e) {
        notify(t('openFileErr', { error: String(e) }), { icon: 'error' })
      }
      return
    }

    if (isLogFile) {
      notify(t('fileDownloading', { path: fullPath }), { icon: 'info' })
      try {
        await main.openFile(device.id, fullPath)
      } catch (e) {
        notify(t('openFileErr', { error: String(e) }), { icon: 'error' })
      }
      return
    }

    // 其他文件根据 mime 类型处理
    if (f.mime) {
      const url = await main.getFileUrl(device.id, fullPath)
      if (f.mime === 'application/pdf') {
        main.openWindow(url, 'pdf', {
          minHeight: 640,
          minWidth: 450,
          width: 450,
          height: 640,
        })
        return
      } else if (startWith(f.mime, 'video')) {
        main.showVideo(url)
        return
      } else if (
        startWith(f.mime, 'image') ||
        startWith(f.mime, 'audio')
      ) {
        setSelectedUrl(url)
        setSelected(f)
        if (!file.showPreview) {
          file.set('showPreview', true)
        }
        return
      }
    }

    // 其他文件下载后用系统程序打开
    notify(t('fileDownloading', { path: fullPath }), { icon: 'info' })
    main.openFile(device.id, fullPath)
  }

  function onContextMenu(e: MouseEvent, f?: IFile) {
    if (!device) {
      return
    }

    if (f) {
      const targetFile = f
      const template: any[] = [
        {
          label: t('open'),
          click: () => open(targetFile),
        },
      ]
      if (!targetFile.directory) {
        template.push({
          label: t('openWithSystem'),
          click: async () => {
            notify(t('fileDownloading', { path: path + targetFile.name }), {
              icon: 'info',
            })
            main.openFile(device.id, path + targetFile.name)
          },
        })
      }
      template.push(
        { type: 'separator' },
        {
          label: t('copy'),
          click: () => {
            clipboardRef.current = {
              type: 'copy',
              files: [targetFile],
              srcPath: path,
            }
            notify(t('copiedToClipboard', { count: 1 }), { icon: 'success' })
          },
        },
        {
          label: t('cut'),
          click: () => {
            clipboardRef.current = {
              type: 'cut',
              files: [targetFile],
              srcPath: path,
            }
            notify(t('cutToClipboard', { count: 1 }), { icon: 'success' })
          },
        }
      )

      if (clipboardRef.current) {
        template.push({
          label: t('paste'),
          click: async () => {
            const { type, files, srcPath } = clipboardRef.current!
            for (const file of files) {
              const srcFilePath = srcPath + file.name
              const destFilePath = path + file.name
              if (type === 'copy') {
                if (file.directory) {
                  await main.copyDir(device.id, srcFilePath, destFilePath)
                } else {
                  const tmpDir = await main.getTmpdir()
                  const tmpPath = tmpDir + '/' + file.name
                  await main.pullFile(device.id, srcFilePath, tmpPath)
                  await main.pushFile(device.id, tmpPath, destFilePath)
                }
              } else if (type === 'cut') {
                await main.moveFile(device.id, srcFilePath, destFilePath)
              }
            }
            if (type === 'cut') {
              clipboardRef.current = null
            }
            getFiles(path)
          },
        })
      }

      template.push(
        { type: 'separator' },
        {
          label: t('download'),
          click: async () => {
            const { canceled, filePaths } = await main.showOpenDialog({
              properties: ['openDirectory'],
            })
            if (canceled) {
              return
            }
            const dest = filePaths[0] + '/' + targetFile.name
            notify(t('fileDownloading', { path: path + targetFile.name }), {
              icon: 'info',
            })
            await main.pullFile(device.id, path + targetFile.name, dest)
            notify(t('fileDownloaded', { path: dest }), {
              icon: 'success',
              duration: 5000,
            })
          },
        },
        { type: 'separator' },
        {
          label: t('copyPath'),
          click: () => {
            navigator.clipboard.writeText(path + targetFile.name)
            notify(t('pathCopied'), { icon: 'success' })
          },
        },
        {
          label: t('delete'),
          click: async () => {
            const result = await LunaModal.confirm(
              t('deleteFileConfirm', { name: targetFile.name })
            )
            if (result) {
              const filePath = path + targetFile.name
              if (targetFile.directory) {
                await main.deleteDir(device.id, filePath)
              } else {
                await main.deleteFile(device.id, filePath)
              }
              getFiles(path)
            }
          },
        },
        {
          label: t('rename'),
          click: async () => {
            const name = await LunaModal.prompt(
              t(targetFile.directory ? 'newFolderName' : 'newFileName'),
              targetFile.name
            )
            if (name && name !== targetFile.name) {
              if (fileExist(name)) {
                notify(t('fileExistErr', { name }), { icon: 'error' })
                return
              }
              await main.moveFile(device.id, path + targetFile.name, path + name)
              getFiles(path)
            }
          },
        }
      )

      contextMenu(e, template)
    } else {
      const template: any[] = [
        {
          label: t('upload'),
          click: uploadFiles,
        },
        {
          label: t('newFolder'),
          click: async () => {
            const name = await LunaModal.prompt(t('newFolderName'))
            if (name) {
              await main.createDir(device.id, path + name)
              getFiles(path)
            }
          },
        },
        {
          label: t('newFile'),
          click: async () => {
            const name = await LunaModal.prompt(t('newFileName'))
            if (name) {
              await main.createFile(device.id, path + name)
              getFiles(path)
            }
          },
        },
        { type: 'separator' },
        {
          label: t('paste'),
          click: async () => {
            if (!clipboardRef.current) return
            const { type, files, srcPath } = clipboardRef.current
            for (const file of files) {
              const srcFilePath = srcPath + file.name
              const destFilePath = path + file.name
              if (type === 'copy') {
                if (file.directory) {
                  await main.copyDir(device.id, srcFilePath, destFilePath)
                } else {
                  const tmpDir = await main.getTmpdir()
                  const tmpPath = tmpDir + '/' + file.name
                  await main.pullFile(device.id, srcFilePath, tmpPath)
                  await main.pushFile(device.id, tmpPath, destFilePath)
                }
              } else if (type === 'cut') {
                await main.moveFile(device.id, srcFilePath, destFilePath)
              }
            }
            if (type === 'cut') {
              clipboardRef.current = null
            }
            getFiles(path)
          },
          enabled: !!clipboardRef.current,
        },
        {
          label: t('refresh'),
          click: () => getFiles(path),
        },
        { type: 'separator' },
        {
          label: t('copyPath'),
          click: () => {
            navigator.clipboard.writeText(path)
            notify(t('pathCopied'), { icon: 'success' })
          },
        },
        {
          label: t('selectAll'),
          click: () => {
            setSelectedFiles([...fileList])
          },
        },
      ]
      contextMenu(e, template)
    }
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDropHighlight(false)
    const files = e.dataTransfer.files
    const apkPaths: string[] = []
    for (let i = 0, len = files.length; i < len; i++) {
      apkPaths.push(preload.getPathForFile(files[i]))
    }
    await uploadFiles(apkPaths)
  }

  async function onDragStart(e: React.DragEvent, f: IFile) {
    if (f.directory) {
      e.preventDefault()
      notify(t('dirDragNotSupported'), { icon: 'info' })
      return
    }

    if (!device) {
      return
    }

    const fullPath = path + f.name
    const tmpDir = await main.getTmpdir()
    const tmpPath = tmpDir + '/' + f.name

    // 下载文件到临时目录
    notify(t('fileDownloading', { path: fullPath }), { icon: 'info' })
    try {
      await main.pullFile(device.id, fullPath, tmpPath)
      // 获取文件图标
      const ext = splitPath(f.name).ext
      const iconPath = await main.getFileIcon(ext.slice(1))
      // 开始拖拽
      await main.startDrag(tmpPath, iconPath)
    } catch (err) {
      notify(t('downloadFileErr', { error: String(err) }), { icon: 'error' })
    }
  }

  async function uploadFiles(files?: string[]) {
    if (!device) {
      return
    }

    if (!files) {
      const { filePaths } = await main.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
      })
      if (isEmpty(filePaths)) {
        return
      }
      files = filePaths
    }

    for (let i = 0, len = files!.length; i < len; i++) {
      const file = files![i]
      const { name } = splitPath(file)
      notify(t('fileUploading', { path: file }), { icon: 'info' })
      try {
        await main.pushFile(device.id, file, path + name)
      } catch {
        notify(t('uploadFileErr'), { icon: 'error' })
      }
    }

    await getFiles(path)
  }

  async function goCustomPath(p: string) {
    if (!endWith(p, '/')) {
      p = p + '/'
    }
    p = normalizePath(p)
    if (p === customPath) {
      return
    }

    setCustomPath(p)

    try {
      const stat = await main.statFile(device!.id, p)
      if (stat.directory) {
        go(p)
      } else {
        setCustomPath(customPath)
      }
    } catch {
      setCustomPath(customPath)
      notify(t('folderNotExistErr'), { icon: 'error' })
    }
  }

  return (
    <div className="panel-with-toolbar">
      <LunaToolbar className="panel-toolbar">
        <ToolbarIcon
          icon="bidirection"
          title={t('transfer')}
          className={className({
            [Style.blink]: !isEmpty(file.transfers),
          })}
          state={file.showTransfer ? 'hover' : ''}
          onClick={() => {
            file.set('showTransfer', !file.showTransfer)
          }}
        />
        <LunaToolbarSeparator />
        <ToolbarIcon
          icon="arrow-left"
          title={t('back')}
          onClick={back}
          disabled={historyIdx <= 0}
        />
        <ToolbarIcon
          icon="arrow-right"
          title={t('forward')}
          onClick={forward}
          disabled={historyIdx >= history.length - 1}
        />
        <ToolbarIcon
          icon="arrow-up"
          title={t('up')}
          onClick={up}
          disabled={path === '/' || !device}
        />
        <ToolbarIcon
          icon="refresh"
          title={t('refresh')}
          onClick={() => getFiles(path)}
          disabled={!device}
        />
        <LunaToolbarHtml className={Style.pathContainer} disabled={!device}>
          <LunaPathBar
            className={Style.path}
            rootLabel={t('storage')}
            path={customPath}
            onChange={(path) => goCustomPath('/' + path)}
          />
        </LunaToolbarHtml>
        <LunaToolbarInput
          keyName="filter"
          value={filter}
          placeholder={t('filter')}
          onChange={(val) => setFilter(val)}
        />
        <LunaToolbarSeparator />
        <ToolbarIcon
          icon="grid"
          title={t('iconView')}
          state={file.listView ? '' : 'hover'}
          onClick={() => {
            if (file.listView) {
              file.set('listView', false)
            }
          }}
        />
        <ToolbarIcon
          icon="list"
          title={t('listView')}
          state={file.listView ? 'hover' : ''}
          onClick={() => {
            if (!file.listView) {
              file.set('listView', true)
            }
          }}
        />
        <LunaToolbarSeparator />
        <ToolbarIcon
          icon="info"
          title={`${t('sort')}: ${sortBy}`}
          onClick={() => {
            const orders: Array<'name' | 'size' | 'mtime' | 'type'> = [
              'name',
              'size',
              'mtime',
              'type',
            ]
            const currentIdx = orders.indexOf(sortBy)
            const nextIdx = (currentIdx + 1) % orders.length
            setSortBy(orders[nextIdx])
            setFileList(sortFiles(fileList))
          }}
        />
        <ToolbarIcon
          icon={sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}
          title={sortOrder === 'asc' ? t('sortAsc') : t('sortDesc')}
          onClick={() => {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
            setFileList(sortFiles(fileList))
          }}
        />
        <LunaToolbarSeparator />
        <ToolbarIcon
          icon="eye"
          title={t('preview')}
          state={file.showPreview ? 'hover' : ''}
          onClick={() => {
            file.set('showPreview', !file.showPreview)
          }}
        />
      </LunaToolbar>
      <LunaSplitPane
        direction="vertical"
        onResize={(weights) => {
          const [fileListWeight, transferWeight] = weights
          file.set(
            'transferWeight',
            (transferWeight / (fileListWeight + transferWeight)) * 100
          )
        }}
      >
        <LunaSplitPaneItem minSize={200} weight={100 - file.transferWeight}>
          <LunaSplitPane onResize={(weights) => file.set('weights', weights)}>
            <LunaSplitPaneItem minSize={400} weight={file.weights[0]}>
              <div
                ref={fileListContainerRef}
                tabIndex={0}
                onKeyDown={handleFileListKeyDown}
                onDrop={onDrop}
                onDragEnter={() => {
                  draggingRef.current++
                }}
                onDragLeave={() => {
                  draggingRef.current--
                  if (draggingRef.current === 0) {
                    setDropHighlight(false)
                  }
                }}
                onDragOver={(e) => {
                  if (!isFileDrop(e)) {
                    return
                  }
                  e.preventDefault()
                  if (device) {
                    setDropHighlight(true)
                  }
                }}
                className={className('panel-body', {
                  [Style.highlight]: dropHighlight,
                })}
              >
                <LunaFileList
                  className={Style.fileList}
                  files={fileList}
                  filter={
                    filter
                      ? (file: IFile) =>
                          startWith(
                            file.name.toLowerCase(),
                            filter.toLowerCase()
                          )
                      : filter
                  }
                  columns={['name', 'mode', 'mtime', 'type', 'size']}
                  listView={file.listView}
                  onDoubleClick={(e: MouseEvent, f: IFile) => open(f)}
                  onContextMenu={onContextMenu}
                  onSelect={(f: IFile, e?: MouseEvent) => {
                    // Ctrl/Shift 多选
                    if (e && (e.ctrlKey || e.metaKey)) {
                      const isSelected = selectedFiles.some((sf) => sf.name === f.name)
                      if (isSelected) {
                        setSelectedFiles(selectedFiles.filter((sf) => sf.name !== f.name))
                      } else {
                        setSelectedFiles([...selectedFiles, f])
                      }
                    } else if (e && e.shiftKey && selected) {
                      // Shift 范围选择
                      const startIdx = fileList.findIndex(
                        (sf) => sf.name === selected.name
                      )
                      const endIdx = fileList.findIndex((sf) => sf.name === f.name)
                      const [from, to] =
                        startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx]
                      const range = fileList.slice(from, to + 1)
                      setSelectedFiles(range)
                    } else {
                      setSelectedFiles([f])
                    }
                    setSelected(f)
                    main.getFileUrl(device!.id, path + f.name).then((url) => {
                      setSelectedUrl(url)
                    })
                  }}
                  onDeselect={() => {
                    setSelectedUrl('')
                    setSelected(undefined)
                  }}
                />
              </div>
            </LunaSplitPaneItem>
            <LunaSplitPaneItem
              minSize={180}
              weight={file.weights[1]}
              visible={file.showPreview}
            >
              <FilePreview
                file={file.showPreview ? selected : undefined}
                url={selectedUrl}
              />
            </LunaSplitPaneItem>
          </LunaSplitPane>
        </LunaSplitPaneItem>
        <LunaSplitPaneItem
          className={Style.transfer}
          minSize={150}
          weight={file.transferWeight}
          visible={file.showTransfer}
        >
          <Transfer />
        </LunaSplitPaneItem>
      </LunaSplitPane>
    </div>
  )
})

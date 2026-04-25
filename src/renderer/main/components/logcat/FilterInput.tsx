import { useState, useRef, useEffect } from 'react'
import Style from './FilterInput.module.scss'
import className from 'licia/className'
import { t } from 'common/util'

interface IProps {
  type: string
  placeholder: string
  value: string
  history: string[]
  onChange: (val: string) => void
  onCommit?: (val: string) => void
  onDeleteHistory?: (val: string) => void
}

export default function FilterInput({
  placeholder,
  value,
  history,
  onChange,
  onCommit,
  onDeleteHistory,
}: IProps) {
  const [showHistory, setShowHistory] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setShowHistory(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      onChange('')
    } else if (e.key === 'Enter') {
      setShowHistory(false)
      if (onCommit && value.trim()) {
        onCommit(value.trim())
      }
    }
  }

  function selectHistory(item: string) {
    onChange(item)
    setShowHistory(false)
    if (onCommit) {
      onCommit(item)
    }
  }

  function toggleHistory(e: React.MouseEvent) {
    e.stopPropagation()
    if (history.length > 0) {
      setShowHistory(!showHistory)
      if (!showHistory) {
        inputRef.current?.focus()
      }
    }
  }

  function handleDeleteHistory(e: React.MouseEvent, item: string) {
    e.stopPropagation()
    if (onDeleteHistory) {
      onDeleteHistory(item)
    }
  }

  return (
    <div className={className(Style.wrapper, { [Style.hasValue]: value })} ref={wrapperRef}>
      <input
        ref={inputRef}
        type="text"
        className={Style.input}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => history.length > 0 && setShowHistory(true)}
        onKeyDown={handleKeyDown}
      />
      {value ? (
        <button
          className={Style.clearBtn}
          onClick={() => onChange('')}
          title={placeholder}
        >
          ×
        </button>
      ) : (
        <button
          className={className(Style.filterBtn, { [Style.active]: showHistory })}
          onClick={toggleHistory}
          title={t('filterHistory')}
        >
          <svg viewBox="0 0 16 16" width="12" height="12">
            <path
              fill="currentColor"
              d="M7 11h2v1H7zm4-4h-1V6h1zm-3 0H6V6h2zM4 4h8v1H4zm0 3h8v1H4zm0 3h5v1H4z"
            />
            <path
              fill="currentColor"
              d="M2 3v1.5L6 9l4-4.5V3z"
              transform="rotate(180 8 6)"
            />
          </svg>
        </button>
      )}
      {showHistory && history.length > 0 && (
        <div className={Style.historyList}>
          {history.map((item, idx) => (
            <div
              key={idx}
              className={Style.historyItem}
              onClick={() => selectHistory(item)}
            >
              <span className={Style.historyText}>{item}</span>
              <button
                className={Style.deleteBtn}
                onClick={(e) => handleDeleteHistory(e, item)}
                title={t('delete')}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

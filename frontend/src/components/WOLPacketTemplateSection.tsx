import React, { useState, useRef } from 'react'
import {
  Upload,
  FileCode,
  RotateCcw,
  Download,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Info,
} from 'lucide-react'

export interface WOLPacketTemplateSectionProps {
  value: string
  onChange: (newValue: string) => void
  host?: string
  port?: number
  useTls?: boolean
  onResetDefault?: () => void
}

/**
 * Renders invisible characters as explicit badges (0x0D, 0x0A, 0xXX)
 */
export function renderVisualTokens(content: string) {
  const elements: React.ReactNode[] = []
  let key = 0
  for (let i = 0; i < content.length; i++) {
    const ch = content[i]
    const code = ch.charCodeAt(0)

    if (ch === '\r') {
      elements.push(
        <span
          key={key++}
          className="inline-flex items-center px-1 rounded bg-cyan-950/90 text-cyan-400 border border-cyan-800 text-[10px] font-mono font-bold mx-0.5 select-all"
          title="回车符 Carriage Return (0x0D)"
        >
          0x0D
        </span>
      )
    } else if (ch === '\n') {
      elements.push(
        <span
          key={key++}
          className="inline-flex items-center px-1 rounded bg-amber-950/90 text-amber-400 border border-amber-800 text-[10px] font-mono font-bold mx-0.5 select-all"
          title="换行符 Line Feed (0x0A)"
        >
          0x0A
        </span>
      )
      elements.push('\n')
    } else if (code < 32 && code !== 9) {
      const hexCode = code.toString(16).padStart(2, '0').toUpperCase()
      elements.push(
        <span
          key={key++}
          className="inline-flex items-center px-1 rounded bg-rose-950/90 text-rose-300 border border-rose-800 text-[10px] font-mono font-bold mx-0.5 select-all"
          title={`控制字符 Control Char (0x${hexCode})`}
        >
          0x{hexCode}
        </span>
      )
    } else {
      elements.push(ch)
    }
  }
  return elements
}

export const WOLPacketTemplateSection: React.FC<WOLPacketTemplateSectionProps> = ({
  value,
  onChange,
  onResetDefault,
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [pendingUpload, setPendingUpload] = useState<{
    filename: string
    size: number
    content: string
  } | null>(null)
  const [uploadNotice, setUploadNotice] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Structural stats helper
  const analyzeContent = (content: string) => {
    const crlfMatches = content.match(/\r\n/g) || []
    const withoutCRLF = content.replace(/\r\n/g, '')
    const lfMatches = withoutCRLF.match(/\n/g) || []
    const crMatches = withoutCRLF.match(/\r/g) || []

    const crlfCount = crlfMatches.length
    const lfCount = lfMatches.length
    const crCount = crMatches.length

    let endingType: 'CRLF' | 'LF' | 'CR' | 'MIXED' | 'NONE' = 'NONE'
    if (crlfCount > 0 && lfCount === 0 && crCount === 0) endingType = 'CRLF'
    else if (crlfCount === 0 && lfCount > 0 && crCount === 0) endingType = 'LF'
    else if (crlfCount === 0 && lfCount === 0 && crCount > 0) endingType = 'CR'
    else if (crlfCount + lfCount + crCount > 0) endingType = 'MIXED'

    const hasDoubleEnding =
      content.endsWith('\r\n\r\n') || content.endsWith('\n\n') || content.endsWith('\r\r')
    const hasMacPlaceholder = /\{mac\}|\{MAC\}/.test(content)
    const byteCount = new TextEncoder().encode(content).length
    const lines = content.length > 0 ? content.split(/\r\n|\r|\n/) : ['']

    return {
      endingType,
      crlfCount,
      lfCount,
      crCount,
      hasDoubleEnding,
      hasMacPlaceholder,
      byteCount,
      linesCount: lines.length,
      lines,
    }
  }

  const currentStats = analyzeContent(value)
  const pendingStats = pendingUpload ? analyzeContent(pendingUpload.content) : null

  // Trigger file selection
  const handleTriggerUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  // Handle file reading with native UTF-8 byte fidelity
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 64 * 1024) {
      alert('上传的文件过大（HTTP 唤醒报文通常在几百字节以内，最大不超过 64KB）')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const content = (event.target?.result as string) || ''
      setPendingUpload({
        filename: file.name,
        size: file.size,
        content: content,
      })
      setUploadNotice(`已读取文件「${file.name}」，请在下方核验不可见字符是否正确`)
      setIsExpanded(true)
    }
    reader.readAsText(file, 'utf-8')
  }

  // Confirm pending upload
  const handleConfirmUpload = () => {
    if (!pendingUpload) return
    onChange(pendingUpload.content)
    setPendingUpload(null)
    setUploadNotice('报文模板已应用，请点击下方「保存 WOL 配置」持久化设置')
  }

  // Cancel pending upload
  const handleCancelUpload = () => {
    setPendingUpload(null)
    setUploadNotice('')
  }

  // Download current template as raw file
  const handleDownloadRaw = () => {
    const blob = new Blob([value], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'wol_packet_template.raw'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/40">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".txt,.raw,.http,.bin,text/*"
        className="hidden"
      />

      {/* Accordion Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:p-4 bg-slate-800/40 hover:bg-slate-800/60 transition-colors gap-3 select-none">
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1"
        >
          <FileCode className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-xs font-semibold text-white">
              HTTP 原始报文模板 (支持 {'{mac}'} 占位符)
            </span>

            {/* Line ending badge */}
            {currentStats.endingType === 'CRLF' && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                CRLF (0x0D 0x0A)
              </span>
            )}
            {currentStats.endingType === 'LF' && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                LF (0x0A)
              </span>
            )}
            {currentStats.endingType === 'MIXED' && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                混合换行符
              </span>
            )}

            {/* {mac} status */}
            {currentStats.hasMacPlaceholder ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                &#123;mac&#125; 已就绪
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                未包含 &#123;mac&#125;
              </span>
            )}

            {/* HTTP header termination status */}
            {currentStats.hasDoubleEnding ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                报头已闭合 (末尾空行)
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                缺少末尾空行
              </span>
            )}

            <span className="text-[10px] text-slate-500 font-mono hidden md:inline">
              ({currentStats.byteCount} 字节 • {currentStats.linesCount} 行)
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <button
            type="button"
            onClick={handleTriggerUpload}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 rounded-xl text-xs font-bold shadow-md shadow-amber-500/10 active:scale-95 transition-all cursor-pointer"
            title="上传原始报文文件（.raw / .txt / .http）"
          >
            <Upload className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>上传报文</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadRaw}
            disabled={!value}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-colors cursor-pointer disabled:opacity-40"
            title="下载当前原始报文文件 (.raw)"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {onResetDefault && (
            <button
              type="button"
              onClick={onResetDefault}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 rounded-xl border border-slate-700 transition-colors cursor-pointer"
              title="重置为默认 HTTP 报文模板"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title={isExpanded ? '收起详情' : '展开查看可视化结果'}
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-amber-400" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Notification if upload notice exists */}
      {uploadNotice && (
        <div className="px-4 py-2.5 bg-amber-500/10 border-t border-amber-500/20 text-amber-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 shrink-0" />
            <span>{uploadNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setUploadNotice('')}
            className="text-amber-400/80 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Pending Upload Confirmation Box */}
      {pendingUpload && pendingStats && (
        <div className="p-4 sm:p-5 border-t border-amber-500/40 bg-amber-500/5 space-y-4 animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-amber-500/20">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-white text-sm">
                  核验上传的报文：{pendingUpload.filename}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-slate-900 text-amber-300 border border-amber-500/30">
                  {pendingStats.byteCount} 字节 • {pendingStats.linesCount} 行
                </span>
                {pendingStats.endingType === 'CRLF' ? (
                  <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    换行符: CRLF (0x0D 0x0A) • 标准 HTTP
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    换行符: {pendingStats.endingType} (0x0A) • 未包含 0x0D
                  </span>
                )}
                {pendingStats.hasDoubleEnding ? (
                  <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    报头已闭合 (末尾空行)
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    缺少末尾空行 (未闭合)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                请核验下方不可见字符预览（0x0D / 0x0A 均显式高亮显示），确认是否符合您的目标网关要求。
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCancelUpload}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
              >
                放弃上传
              </button>
              <button
                type="button"
                onClick={handleConfirmUpload}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer"
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>确认无误，使用此报文</span>
              </button>
            </div>
          </div>

          {/* Warning if {mac} is missing in uploaded file */}
          {!pendingStats.hasMacPlaceholder && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-xl text-rose-400 text-xs flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                <strong>警告：</strong>上传的报文中<strong>未检测到 &#123;mac&#125; 占位符</strong>！系统唤醒时将无法动态填入目标主机的 MAC 地址，请确认是否遗漏。
              </span>
            </div>
          )}

          {/* Warning if double ending is missing in uploaded file */}
          {!pendingStats.hasDoubleEnding && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-xl text-rose-400 text-xs flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                <strong>警告：上传的报文末尾缺少 HTTP 报头结束空行！</strong>HTTP 协议规定报头末尾需以空行（CRLF CRLF）闭合，否则目标服务器会判定请求尚未发送完成而持续等待挂起直至超时。
              </span>
            </div>
          )}

          {/* Pending Visualized Content with Line Numbers */}
          <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 shadow-inner flex">
            <div className="select-none py-3.5 px-2.5 bg-slate-900/60 border-r border-slate-800/80 text-right font-mono text-[11px] text-slate-600 w-9 leading-relaxed shrink-0">
              {Array.from({ length: Math.max(pendingStats.linesCount, 1) }, (_, i) => i + 1).map((num) => (
                <div key={num}>{num}</div>
              ))}
            </div>
            <div className="p-3.5 flex-1 min-h-[140px] max-h-[320px] font-mono text-xs leading-relaxed whitespace-pre-wrap overflow-y-auto select-text text-slate-200">
              {renderVisualTokens(pendingUpload.content)}
            </div>
          </div>
        </div>
      )}

      {/* Expanded View: Visualized Result of the Saved Template */}
      {isExpanded && !pendingUpload && (
        <div className="p-4 sm:p-5 border-t border-slate-800 space-y-4 animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="text-xs text-slate-400">
              报文中使用 <span className="font-mono font-bold text-amber-400">&#123;mac&#125;</span> 作为目标主机物理地址占位符。下发时将二进制透传至目标网络控制网关。
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTriggerUpload}
                className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer"
              >
                <Upload className="w-3 h-3" />
                <span>更换报文文件</span>
              </button>
              <span className="text-slate-700">|</span>
              <button
                type="button"
                onClick={handleDownloadRaw}
                className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white font-medium cursor-pointer"
              >
                <Download className="w-3 h-3" />
                <span>导出 .raw 文件</span>
              </button>
            </div>
          </div>

          {/* Warnings for currently saved template */}
          {!currentStats.hasMacPlaceholder && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-xl text-rose-400 text-xs flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                当前报文中缺少 <code className="font-mono text-white">&#123;mac&#125;</code> 占位符，下发唤醒指令时将无法动态填入目标硬件地址。
              </span>
            </div>
          )}

          {currentStats.endingType !== 'CRLF' && currentStats.endingType !== 'NONE' && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl text-amber-300 text-xs flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>
                提示：当前换行符为 <strong className="font-mono text-white">{currentStats.endingType}</strong>（非标准 CRLF）。后端将原样透传发送，若您的网关较严格可能需要 0x0D 0x0A 换行。
              </span>
            </div>
          )}

          {!currentStats.hasDoubleEnding && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-xl text-rose-400 text-xs flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                <strong>警告：当前报文末尾缺少 HTTP 报头结束空行！</strong>HTTP 协议规定报头必须以空行（CRLF CRLF）闭合，否则目标网关服务器将判定 HTTP 请求未接收完毕而超时挂起。
              </span>
            </div>
          )}

          {/* Current Template Visualizer (with line numbers on left, no right column) */}
          <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 shadow-inner flex">
            {/* Line numbers column */}
            <div className="select-none py-3.5 px-2.5 bg-slate-900/60 border-r border-slate-800/80 text-right font-mono text-[11px] text-slate-600 w-9 leading-relaxed shrink-0">
              {Array.from({ length: Math.max(currentStats.linesCount, 1) }, (_, i) => i + 1).map((num) => (
                <div key={num}>{num}</div>
              ))}
            </div>

            {/* Visual Token Stream */}
            <div className="p-3.5 flex-1 min-h-[160px] max-h-[360px] font-mono text-xs leading-relaxed whitespace-pre-wrap overflow-y-auto select-text text-slate-200">
              {renderVisualTokens(value)}
            </div>
          </div>

          {/* Legend Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-slate-900 text-[11px] text-slate-500 font-mono">
            <div className="flex items-center gap-3.5 flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                <span className="text-cyan-400">0x0D</span> = \r (回车符)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-amber-400">0x0A</span> = \n (换行符)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>0x0D 0x0A = CRLF 标准 HTTP 换行</span>
              </span>
            </div>
            <span>报文大小: {currentStats.byteCount} 字节</span>
          </div>
        </div>
      )}
    </div>
  )
}

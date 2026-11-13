import React, { useState, useEffect, useRef } from 'react'
import {
  Plus,
  ExternalLink,
  Trash2,
  Edit2,
  Server,
  Router,
  Film,
  DownloadCloud,
  Boxes,
  Home,
  Globe,
  Terminal,
  Database,
  Search,
  X,
  Compass,
  Upload,
  Image as ImageIcon,
  Check,
  Cpu,
  Wifi,
  HardDrive,
  Shield,
  Tv,
  Music,
  Cloud,
  Folder,
  Share2,
  Library,
  Download,
  AlertTriangle,
  RefreshCw,
  GripVertical,
  Copy,
} from 'lucide-react'
import { api, NavItem, NavIconMetadata } from '../api/client'
import { NavIconImage } from '../components/NavIconImage'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Globe,
  Server,
  Router,
  Film,
  DownloadCloud,
  Boxes,
  Home,
  Terminal,
  Database,
  Cpu,
  Wifi,
  HardDrive,
  Shield,
  Tv,
  Music,
  Cloud,
  Folder,
  Share2,
}

const PRESET_ICONS = [
  { key: 'Globe', label: '通用' },
  { key: 'Server', label: '服务器' },
  { key: 'Router', label: '路由器' },
  { key: 'Film', label: '流媒体' },
  { key: 'DownloadCloud', label: '下载器' },
  { key: 'Boxes', label: '容器' },
  { key: 'Terminal', label: '终端' },
  { key: 'Database', label: '数据库' },
  { key: 'Home', label: '家居' },
  { key: 'HardDrive', label: '存储' },
  { key: 'Cpu', label: '硬件' },
  { key: 'Wifi', label: '网络' },
  { key: 'Shield', label: '安全' },
  { key: 'Tv', label: '电视' },
  { key: 'Music', label: '音乐' },
  { key: 'Cloud', label: '云服务' },
  { key: 'Folder', label: '网盘' },
  { key: 'Share2', label: '协作' },
]

export const isCustomImageData = (str?: string | null) => {
  if (!str) return false
  return (
    str.startsWith('data:image/') ||
    str.startsWith('http://') ||
    str.startsWith('https://') ||
    str.startsWith('blob:')
  )
}

/**
 * Normalizes an uploaded image file into a square standardized Data URL (Blob string)
 * using HTML5 Canvas to ensure consistent specs (160x160 px).
 */
export const processImageToSquareDataUrl = (file: File, size = 160): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      return reject(new Error('请选择有效的图片文件'))
    }

    // Preserve vector quality for SVG
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('读取 SVG 失败'))
      reader.readAsDataURL(file)
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(e.target?.result as string)
          return
        }

        ctx.clearRect(0, 0, size, size)

        // Calculate aspect fit inside square canvas
        const scale = Math.min(size / img.width, size / img.height)
        const w = img.width * scale
        const h = img.height * scale
        const x = (size - w) / 2
        const y = (size - h) / 2

        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, x, y, w, h)

        // Output as PNG data URL to preserve transparency and fidelity
        const dataUrl = canvas.toDataURL('image/png')
        resolve(dataUrl)
      }
      img.onerror = () => reject(new Error('图片解析失败'))
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error('读取图片文件失败'))
    reader.readAsDataURL(file)
  })
}

/**
 * Normalizes an arbitrary image Data URL into a standardized 160x160 square Data URL
 */
export const processDataUrlToSquare = (dataUrl: string, size = 160): Promise<string> => {
  return new Promise((resolve) => {
    if (dataUrl.startsWith('data:image/svg+xml')) {
      resolve(dataUrl)
      return
    }

    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(dataUrl)
        return
      }

      ctx.clearRect(0, 0, size, size)
      const scale = Math.min(size / img.width, size / img.height)
      const w = img.width * scale
      const h = img.height * scale
      const x = (size - w) / 2
      const y = (size - h) / 2

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, x, y, w, h)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

export const NavigationPage: React.FC = () => {
  const [items, setItems] = useState<NavItem[]>([])
  const [customIcons, setCustomIcons] = useState<NavIconMetadata[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingChanges, setPendingChanges] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [iconsLoading, setIconsLoading] = useState(false)
  const [iconsError, setIconsError] = useState('')
  const [iconsLoaded, setIconsLoaded] = useState(false)
  const [libraryRetry, setLibraryRetry] = useState(0)
  const [iconRefreshKey, setIconRefreshKey] = useState(0)
  const [iconSeeds, setIconSeeds] = useState<Record<number, string>>({})
  const requestSequence = useRef(0)
  const librarySequence = useRef(0)
  const [search, setSearch] = useState('')

  // Add / Edit Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState<NavItem | null>(null)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [category, setCategory] = useState('常用')
  const [description, setDescription] = useState('')

  // Icon selection state: either a preset name OR a custom icon ID
  const [selectedPresetIcon, setSelectedPresetIcon] = useState('Globe')
  const [selectedIconId, setSelectedIconId] = useState<number | null>(null)
  const [iconTab, setIconTab] = useState<'preset' | 'library' | 'upload' | 'url'>('preset')

  // Upload new icon state inside modal
  const [newIconName, setNewIconName] = useState('')
  const [uploadLoading, setUploadLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // URL download icon state inside modal
  const [iconFetchUrl, setIconFetchUrl] = useState('')
  const [fetchLoading, setFetchLoading] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [previewIcon, setPreviewIcon] = useState<{
    data: string
    mimeType: string
    size: number
    filename: string
    suggestedName: string
  } | null>(null)
  const [saveFetchedLoading, setSaveFetchedLoading] = useState(false)

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    item: NavItem
  } | null>(null)

  // Drag and drop sorting & cross-category moving state
  const [draggedItem, setDraggedItem] = useState<NavItem | null>(null)
  const [dragOverItem, setDragOverItem] = useState<{ id: number; position: 'before' | 'after' } | null>(null)
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const isDraggingRef = useRef(false)

  // Drag and drop sorting state (Categories/Groups)
  const [draggedCategory, setDraggedCategory] = useState<string | null>(null)
  const [dragOverCategoryTarget, setDragOverCategoryTarget] = useState<{
    name: string
    position: 'before' | 'after'
  } | null>(null)

  const beginNavigationChange = () => {
    requestSequence.current++
    setPendingChanges((count) => count + 1)
    setLoading(false)
    setLoadError('')
  }

  const finishNavigationChange = () => setPendingChanges((count) => count - 1)

  const fetchData = async (refresh = false) => {
    const sequence = ++requestSequence.current
    setLoading(true)
    setLoadError('')
    try {
      const itemList = await api.nav.list(refresh)
      if (sequence !== requestSequence.current) return
      if (refresh) {
        const ids = [...new Set(itemList.flatMap((item) => item.iconId ? [item.iconId] : []))]
        const results = await Promise.allSettled(ids.map((id) => api.nav.getIcon(id, true)))
        if (sequence !== requestSequence.current) return
        const seeds: Record<number, string> = {}
        results.forEach((result) => {
          if (result.status === 'fulfilled') seeds[result.value.id] = result.value.data
        })
        setIconSeeds(seeds)
        setIconRefreshKey((version) => version + 1)
        if (results.some((result) => result.status === 'rejected')) {
          setLoadError('卡片已更新，部分图标刷新失败，请重试')
        }
        if (iconsLoaded) {
          try {
            const icons = await api.nav.listIcons(true)
            if (sequence !== requestSequence.current) return
            setCustomIcons(icons)
          } catch {
            if (sequence === requestSequence.current) setLoadError('卡片已更新，图标库列表刷新失败，请重试')
          }
        }
      }
      if (sequence === requestSequence.current) setItems(itemList)
    } catch (err) {
      if (sequence === requestSequence.current) {
        setLoadError(err instanceof Error ? err.message : '导航加载失败，请重试')
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false)
    }
  }

  useEffect(() => {
    void fetchData()
    return () => { requestSequence.current++ }
  }, [])

  useEffect(() => {
    if (!showModal || iconTab !== 'library') return
    const sequence = ++librarySequence.current
    let active = true
    setIconsLoading(true)
    setIconsError('')
    api.nav.listIcons().then((icons) => {
      if (active && sequence === librarySequence.current) {
        setCustomIcons(icons)
        setIconsLoaded(true)
      }
    }).catch((err) => {
      if (active && sequence === librarySequence.current) {
        setIconsError(err instanceof Error ? err.message : '图标库加载失败')
      }
    }).finally(() => {
      if (active && sequence === librarySequence.current) setIconsLoading(false)
    })
    return () => { active = false }
  }, [showModal, iconTab, libraryRetry])

  // Dismiss context menu on window events
  useEffect(() => {
    const handleDismiss = () => setContextMenu(null)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null)
    }
    window.addEventListener('click', handleDismiss)
    window.addEventListener('scroll', handleDismiss, true)
    window.addEventListener('resize', handleDismiss)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('click', handleDismiss)
      window.removeEventListener('scroll', handleDismiss, true)
      window.removeEventListener('resize', handleDismiss)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // Order of categories based on how items are stored
  const categoryList: string[] = []
  items.forEach((item) => {
    const cat = item.category?.trim() || '常用'
    if (!categoryList.includes(cat)) {
      categoryList.push(cat)
    }
  })

  const handleOpenAdd = (defaultCat?: string) => {
    setEditingItem(null)
    setTitle('')
    setUrl('')
    setCategory(defaultCat || (categoryList[0] || '常用'))
    setDescription('')
    setSelectedPresetIcon('Globe')
    setSelectedIconId(null)
    setNewIconName('')
    setIconFetchUrl('')
    setFetchError('')
    setPreviewIcon(null)
    setIconTab('preset')
    setShowModal(true)
  }

  const handleOpenEdit = (item: NavItem) => {
    setEditingItem(item)
    setTitle(item.title)
    setUrl(item.url)
    setCategory(item.category || '常用')
    setDescription(item.description || '')
    setNewIconName('')
    setIconFetchUrl('')
    setFetchError('')
    setPreviewIcon(null)

    if (item.iconId) {
      setSelectedIconId(item.iconId)
      setSelectedPresetIcon('')
      setIconTab('library')
    } else {
      setSelectedIconId(null)
      setSelectedPresetIcon(item.icon || 'Globe')
      setIconTab('preset')
    }
    setShowModal(true)
  }

  const handleContextMenu = (e: React.MouseEvent, item: NavItem) => {
    e.preventDefault()
    e.stopPropagation()
    const menuWidth = 180
    const menuHeight = 160
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 10)
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 10)
    setContextMenu({ x, y, item })
  }

  // Handle uploading and persisting a new reusable icon
  const handleUploadNewIcon = async (file: File) => {
    setUploadLoading(true)
    try {
      const dataUrl = await processImageToSquareDataUrl(file, 160)
      const iconName = newIconName.trim() || title.trim() || file.name.replace(/\.[^/.]+$/, '') || '自定义图标'

      // Save icon to backend icons library
      const createdIcon = await api.nav.createIcon({
        name: iconName,
        data: dataUrl,
      })

      // Update local icons library and preview without downloading the uploaded data again.
      librarySequence.current++
      setIconsLoading(false)
      setIconSeeds((prev) => ({ ...prev, [createdIcon.id]: createdIcon.data }))
      setCustomIcons((prev) => [createdIcon, ...prev])

      // Auto-select this newly created icon
      setSelectedIconId(createdIcon.id)
      setSelectedPresetIcon('')
      setNewIconName('')

      // Switch to library tab so user sees it selected
      setIconTab('library')
    } catch (err: any) {
      alert(err.message || '图标上传失败')
    } finally {
      setUploadLoading(false)
    }
  }

  // Handle fetching an icon from a URL for preview
  const handleFetchIcon = async () => {
    const targetUrl = iconFetchUrl.trim()
    if (!targetUrl) return

    setFetchLoading(true)
    setFetchError('')
    setPreviewIcon(null)
    try {
      const res = await api.nav.fetchIcon(targetUrl)
      const squareData = await processDataUrlToSquare(res.data, 160)
      setPreviewIcon({
        data: squareData,
        mimeType: res.mimeType,
        size: res.size,
        filename: res.filename,
        suggestedName: title.trim() || res.filename || '网络图标',
      })
    } catch (err: any) {
      setFetchError(err.message || '获取图标失败，请检查 URL 是否可访问')
    } finally {
      setFetchLoading(false)
    }
  }

  // Handle confirming previewed icon into the library and selecting it
  const handleSavePreviewIcon = async () => {
    if (!previewIcon) return
    setSaveFetchedLoading(true)
    try {
      const iconName = previewIcon.suggestedName.trim() || title.trim() || '网络图标'
      const createdIcon = await api.nav.createIcon({
        name: iconName,
        data: previewIcon.data,
      })

      // Update local icons library and preview without downloading the uploaded data again.
      librarySequence.current++
      setIconsLoading(false)
      setIconSeeds((prev) => ({ ...prev, [createdIcon.id]: createdIcon.data }))
      setCustomIcons((prev) => [createdIcon, ...prev])

      // Auto-select this newly created icon
      setSelectedIconId(createdIcon.id)
      setSelectedPresetIcon('')

      // Reset URL state & switch to library tab
      setPreviewIcon(null)
      setIconFetchUrl('')
      setFetchError('')
      setIconTab('library')
    } catch (err: any) {
      alert(err.message || '图标入库失败')
    } finally {
      setSaveFetchedLoading(false)
    }
  }

  const handleDeleteCustomIcon = async (e: React.MouseEvent, iconId: number) => {
    e.stopPropagation()
    if (!confirm('确定从图标库中删除该图标？已绑定该图标的书签将恢复为默认图标。')) return
    beginNavigationChange()

    try {
      await api.nav.deleteIcon(iconId)
      librarySequence.current++
      setIconsLoading(false)
      setIconSeeds((prev) => {
        const next = { ...prev }
        delete next[iconId]
        return next
      })
      setCustomIcons((prev) => prev.filter((i) => i.id !== iconId))
      if (selectedIconId === iconId) {
        setSelectedIconId(null)
        setSelectedPresetIcon('Globe')
        setIconTab('preset')
      }
      // Refresh items to update any unlinked bookmarks
      const freshItems = await api.nav.list()
      setItems(freshItems)
    } catch (err: any) {
      alert(err.message || '删除图标失败')
    } finally {
      finishNavigationChange()
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUploadNewIcon(e.dataTransfer.files[0])
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title || !url) return
    beginNavigationChange()

    try {
      const targetCategory = category?.trim() || '常用'
      const payload: Partial<NavItem> = {
        title,
        url,
        category: targetCategory,
        description,
        icon: selectedIconId ? '' : selectedPresetIcon || 'Globe',
        iconId: selectedIconId,
      }

      if (editingItem) {
        const oldCategory = editingItem.category?.trim() || '常用'
        if (oldCategory === targetCategory) {
          // Category not changed: strictly preserve existing orderIndex
          await api.nav.update(editingItem.id, {
            ...payload,
            orderIndex: editingItem.orderIndex,
          })
        } else {
          // Category changed: place at the end of the new category
          const remainingItems = items.filter((it) => it.id !== editingItem.id)
          let lastCatIdx = -1
          for (let i = 0; i < remainingItems.length; i++) {
            if ((remainingItems[i].category?.trim() || '常用') === targetCategory) {
              lastCatIdx = i
            }
          }
          const movedItem = { ...editingItem, ...payload, category: targetCategory }
          if (lastCatIdx !== -1) {
            remainingItems.splice(lastCatIdx + 1, 0, movedItem)
          } else {
            remainingItems.push(movedItem)
          }
          const reordered = remainingItems.map((it, idx) => ({
            ...it,
            orderIndex: idx + 1,
          }))
          await api.nav.update(editingItem.id, payload)
          await api.nav.reorder(
            reordered.map((it) => ({
              id: it.id,
              category: it.category?.trim() || '常用',
              orderIndex: it.orderIndex,
            }))
          )
        }
      } else {
        // Adding new item: append to the end of targetCategory
        const currentItems = [...items]
        let lastCatIdx = -1
        for (let i = 0; i < currentItems.length; i++) {
          if ((currentItems[i].category?.trim() || '常用') === targetCategory) {
            lastCatIdx = i
          }
        }
        const created = await api.nav.create({
          ...payload,
          orderIndex: items.length + 1,
        })
        if (lastCatIdx !== -1) {
          currentItems.splice(lastCatIdx + 1, 0, created)
        } else {
          currentItems.push(created)
        }
        const reordered = currentItems.map((it, idx) => ({
          ...it,
          orderIndex: idx + 1,
        }))
        await api.nav.reorder(
          reordered.map((it) => ({
            id: it.id,
            category: it.category?.trim() || '常用',
            orderIndex: it.orderIndex,
          }))
        )
      }

      setShowModal(false)
      const freshItems = await api.nav.list()
      setItems(freshItems)
    } catch (err: any) {
      alert(err.message || '保存失败')
    } finally {
      finishNavigationChange()
    }
  }

  const handleDeleteItem = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    if (!confirm('确定删除该导航书签？')) return
    beginNavigationChange()
    try {
      await api.nav.delete(id)
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch (err: any) {
      alert(err.message || '删除失败')
    } finally {
      finishNavigationChange()
    }
  }

  // Card click & interaction handlers
  const handleCardClick = (e: React.MouseEvent, item: NavItem) => {
    if (isDraggingRef.current) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    window.open(item.url, '_blank', 'noopener,noreferrer')
  }

  const handleCardAuxClick = (e: React.MouseEvent, item: NavItem) => {
    // Middle mouse button click opens in new tab
    if (e.button === 1) {
      e.preventDefault()
      window.open(item.url, '_blank', 'noopener,noreferrer')
    }
  }

  const handleCardKeyDown = (e: React.KeyboardEvent, item: NavItem) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      window.open(item.url, '_blank', 'noopener,noreferrer')
    }
  }

  // Drag and drop event handlers
  const handleDragStart = (e: React.DragEvent, item: NavItem) => {
    if (search.trim()) {
      e.preventDefault()
      return
    }
    e.stopPropagation()
    isDraggingRef.current = true
    setIsDragging(true)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(item.id))

    // Set the whole card as the drag ghost image
    const cardEl = (e.currentTarget as HTMLElement).closest('[data-nav-card]') as HTMLElement
    if (cardEl && e.dataTransfer.setDragImage) {
      const rect = cardEl.getBoundingClientRect()
      e.dataTransfer.setDragImage(cardEl, e.clientX - rect.left, e.clientY - rect.top)
    }

    setDraggedItem(item)
  }

  const handleCardDragOver = (e: React.DragEvent, targetItem: NavItem) => {
    if (!draggedItem) return
    e.preventDefault()
    e.stopPropagation()
    if (draggedItem.id === targetItem.id) return

    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const isHorizontal = rect.width > 200 && window.innerWidth >= 640
    const isBefore = isHorizontal
      ? e.clientX < rect.left + rect.width / 2
      : e.clientY < rect.top + rect.height / 2
    const position: 'before' | 'after' = isBefore ? 'before' : 'after'

    setDragOverItem({ id: targetItem.id, position })
    setDragOverCategory(targetItem.category || '常用')
  }

  const handleCategoryDragOver = (e: React.DragEvent, catName: string) => {
    if (!draggedItem) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverCategory(catName)
    // Clear card-level insertion indicator if hovering directly on category container
    if (e.target === e.currentTarget) {
      setDragOverItem(null)
    }
  }

  const handleDragEnd = () => {
    setDraggedItem(null)
    setDragOverItem(null)
    setDragOverCategory(null)
    setTimeout(() => {
      isDraggingRef.current = false
      setIsDragging(false)
    }, 150)
  }

  // Category (Group) drag and drop handlers
  const handleCategoryDragStart = (e: React.DragEvent, catName: string) => {
    if (search.trim()) {
      e.preventDefault()
      return
    }
    e.stopPropagation()
    isDraggingRef.current = true
    setIsDragging(true)
    setDraggedCategory(catName)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', `category:${catName}`)
  }

  const handleCategoryDragOverCategory = (e: React.DragEvent, targetCatName: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (!draggedCategory || draggedCategory === targetCatName) return

    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const position: 'before' | 'after' = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    setDragOverCategoryTarget({ name: targetCatName, position })
  }

  const handleCategoryDragEnd = () => {
    setDraggedCategory(null)
    setDragOverCategoryTarget(null)
    setTimeout(() => {
      isDraggingRef.current = false
      setIsDragging(false)
    }, 150)
  }

  const executeCategoryReorder = async (
    sourceCat: string,
    targetCat: string,
    position: 'before' | 'after'
  ) => {
    if (sourceCat === targetCat) return

    // 1. Reorder category sequence
    const currentCats = [...categoryList]
    const sourceIdx = currentCats.indexOf(sourceCat)
    if (sourceIdx === -1) return
    currentCats.splice(sourceIdx, 1)

    const targetIdx = currentCats.indexOf(targetCat)
    if (targetIdx === -1) {
      currentCats.push(sourceCat)
    } else {
      const insertIdx = position === 'before' ? targetIdx : targetIdx + 1
      currentCats.splice(insertIdx, 0, sourceCat)
    }

    // 2. Map existing items by category (keeping relative order within each category)
    const itemsByCat: Record<string, NavItem[]> = {}
    for (const cat of currentCats) {
      itemsByCat[cat] = []
    }
    for (const item of items) {
      const cat = item.category?.trim() || '常用'
      if (!itemsByCat[cat]) itemsByCat[cat] = []
      itemsByCat[cat].push(item)
    }

    // 3. Flatten items in new category sequence
    const newItems: NavItem[] = []
    for (const cat of currentCats) {
      if (itemsByCat[cat]) {
        newItems.push(...itemsByCat[cat])
      }
    }
    for (const [cat, catItems] of Object.entries(itemsByCat)) {
      if (!currentCats.includes(cat)) {
        newItems.push(...catItems)
      }
    }

    // 4. Sequential monotonic orderIndex
    const reordered = newItems.map((it, idx) => ({
      ...it,
      orderIndex: idx + 1,
    }))

    // 5. Optimistic UI update
    beginNavigationChange()
    setItems(reordered)

    // 6. Persist to backend
    try {
      const payload = reordered.map((it) => ({
        id: it.id,
        category: it.category || '常用',
        orderIndex: it.orderIndex,
      }))
      await api.nav.reorder(payload)
    } catch (err: any) {
      console.error('保存分组排序失败:', err)
      const fresh = await api.nav.list()
      setItems(fresh)
    } finally {
      finishNavigationChange()
    }
  }

  const handleCategoryDropOnCategory = (e: React.DragEvent, targetCatName: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (!draggedCategory || draggedCategory === targetCatName) {
      handleCategoryDragEnd()
      return
    }

    const pos = dragOverCategoryTarget?.name === targetCatName ? dragOverCategoryTarget.position : 'before'
    executeCategoryReorder(draggedCategory, targetCatName, pos)
    handleCategoryDragEnd()
  }

  const executeReorder = async (
    itemToMove: NavItem,
    targetCategory: string,
    targetItemId: number | null,
    position: 'before' | 'after'
  ) => {
    const currentItems = [...items]
    const dragIdx = currentItems.findIndex((i) => i.id === itemToMove.id)
    if (dragIdx === -1) return

    const [removed] = currentItems.splice(dragIdx, 1)
    const updated = { ...removed, category: targetCategory }

    if (targetItemId !== null) {
      const targetIdx = currentItems.findIndex((i) => i.id === targetItemId)
      if (targetIdx !== -1) {
        const insertIdx = position === 'before' ? targetIdx : targetIdx + 1
        currentItems.splice(insertIdx, 0, updated)
      } else {
        currentItems.push(updated)
      }
    } else {
      // Find the last item in targetCategory to append after
      let lastCatIdx = -1
      for (let i = 0; i < currentItems.length; i++) {
        if ((currentItems[i].category || '常用') === targetCategory) {
          lastCatIdx = i
        }
      }
      if (lastCatIdx !== -1) {
        currentItems.splice(lastCatIdx + 1, 0, updated)
      } else {
        currentItems.push(updated)
      }
    }

    // Monotonic sequential orderIndex ensures DB query order_index asc preserves category and relative order
    const reordered = currentItems.map((it, idx) => ({
      ...it,
      orderIndex: idx + 1,
    }))

    // Optimistic UI update
    beginNavigationChange()
    setItems(reordered)

    // Persist to backend
    try {
      const payload = reordered.map((it) => ({
        id: it.id,
        category: it.category || '常用',
        orderIndex: it.orderIndex,
      }))
      await api.nav.reorder(payload)
    } catch (err: any) {
      console.error('保存排序失败:', err)
      const fresh = await api.nav.list()
      setItems(fresh)
    } finally {
      finishNavigationChange()
    }
  }

  const handleDropOnCard = (e: React.DragEvent, targetItem: NavItem) => {
    if (!draggedItem) return
    e.preventDefault()
    e.stopPropagation()
    if (draggedItem.id === targetItem.id) {
      handleDragEnd()
      return
    }

    const targetCategory = targetItem.category || '常用'
    const pos = dragOverItem?.id === targetItem.id ? dragOverItem.position : 'before'
    executeReorder(draggedItem, targetCategory, targetItem.id, pos)
    handleDragEnd()
  }

  const handleDropOnCategory = (e: React.DragEvent, targetCategory: string) => {
    if (!draggedItem) return
    e.preventDefault()
    e.stopPropagation()

    executeReorder(draggedItem, targetCategory, null, 'after')
    handleDragEnd()
  }

  // Filter items by search keyword across all categories
  const filteredItems = items.filter((item) => {
    if (!search.trim()) return true
    const term = search.toLowerCase()
    return (
      item.title.toLowerCase().includes(term) ||
      item.description?.toLowerCase().includes(term) ||
      item.url.toLowerCase().includes(term) ||
      item.category?.toLowerCase().includes(term)
    )
  })

  // Group filtered items by category (SunPanel grouping style)
  const groupedItems = filteredItems.reduce<Record<string, NavItem[]>>((acc, item) => {
    const cat = item.category?.trim() || '常用'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  // Helper to render the enlarged uniform icon badge for an item
  const renderItemBadge = (item: NavItem) => {
    const customData = isCustomImageData(item.icon) ? item.icon : null
    const IconComp = ICON_MAP[item.icon] || Globe
    const fallback = <IconComp className="w-5 h-5 pointer-events-none select-none" />

    return (
      <div className="w-8 h-8 rounded-lg bg-raised text-muted flex items-center justify-center group-hover:bg-surface transition-colors overflow-hidden shrink-0 p-1.5 pointer-events-none select-none">
        {item.iconId ? (
          <NavIconImage
            iconId={item.iconId}
            alt={item.title}
            refreshKey={iconRefreshKey}
            initialData={iconSeeds[item.iconId]}
            className="w-full h-full object-contain select-none pointer-events-none"
            fallback={fallback}
          />
        ) : customData ? (
          <img
            src={customData}
            alt={item.title}
            className="w-full h-full object-contain select-none pointer-events-none"
            draggable={false}
            loading="lazy"
          />
        ) : fallback}
      </div>
    )
  }

  // Helper to render the live preview icon in the modal
  const renderModalPreviewIcon = () => {
    const IconComp = ICON_MAP[selectedPresetIcon] || Globe
    return (
      <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg bg-raised text-muted flex items-center justify-center overflow-hidden shrink-0 shadow-panel p-2.5">
        {selectedIconId ? (
          <NavIconImage
            iconId={selectedIconId}
            alt="图标预览"
            refreshKey={iconRefreshKey}
            initialData={iconSeeds[selectedIconId]}
            className="w-full h-full object-contain select-none"
            fallback={<Globe className="w-6 h-6 sm:w-7 sm:h-7" />}
          />
        ) : <IconComp className="w-6 h-6 sm:w-7 sm:h-7" />}
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Top Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-ink flex items-center gap-2">
            <Compass className="w-5 h-5 text-accent" />
            <span>导航中心</span>
          </h2>
          <p className="mt-1.5 text-xs text-muted">常用服务，触手可及</p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Search box */}
          <div className="relative flex-1 min-w-0 sm:flex-none">
            <Search className="w-3.5 h-3.5 text-muted absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索服务或分类..."
              className="pl-8 pr-3 py-1.5 bg-field border border-border-strong rounded-lg text-xs text-ink placeholder-muted focus:outline-none focus:border-accent-border w-full min-w-0 sm:w-52"
            />
          </div>

          <button
            type="button"
            onClick={() => void fetchData(true)}
            disabled={loading || pendingChanges > 0}
            title="刷新导航"
            aria-label="刷新导航"
            aria-busy={loading}
            className="flex items-center justify-center w-8 h-8 shrink-0 rounded-lg border border-border bg-surface text-muted hover:text-accent hover:border-accent-border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => handleOpenAdd()}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary-hover text-on-primary rounded-lg text-xs font-semibold shadow-panel active:translate-y-px cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>添加书签</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div role="alert" className="flex items-center gap-2 p-3 rounded-lg border border-danger-border bg-danger-soft text-danger text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {/* Main Content: Grouped by Category (SunPanel Style) */}
      {loading && items.length === 0 ? (
        <div role="status" className="p-12 text-center text-xs text-muted">正在加载导航服务...</div>
      ) : loadError && items.length === 0 ? (
        <div className="p-12 text-center text-xs text-muted">点击右上角刷新按钮重试</div>
      ) : items.length === 0 ? (
        /* Empty Database State */
        <div className="p-12 text-center rounded-2xl border border-dashed border-border bg-surface">
          <p className="text-xs text-muted mb-4">暂无导航服务，点击下方按钮添加属于你的家庭服务</p>
          <button
            onClick={() => handleOpenAdd()}
            className="px-4 py-2 bg-primary text-on-primary font-semibold text-xs rounded-lg cursor-pointer"
          >
            添加第一个服务书签
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        /* No Search Match State */
        <div className="p-12 text-center rounded-2xl border border-dashed border-border bg-surface">
          <p className="text-xs text-muted mb-4">
            未找到与「<span className="text-accent">{search}</span>」匹配的导航服务
          </p>
          <button
            onClick={() => setSearch('')}
            className="px-4 py-2 bg-raised hover:bg-raised-strong text-ink font-medium text-xs rounded-lg cursor-pointer"
          >
            清空搜索关键词
          </button>
        </div>
      ) : (
        /* Render Category Sections (Separated Groups) */
        <div className="space-y-10">
          {categoryList.map((catName) => {
            const groupList = groupedItems[catName]
            if (!groupList || groupList.length === 0) return null

            return (
              <section
                key={catName}
                id={`section-${catName}`}
                onDragOver={(e) => {
                  if (draggedCategory) {
                    handleCategoryDragOverCategory(e, catName)
                  }
                }}
                onDrop={(e) => {
                  if (draggedCategory) {
                    handleCategoryDropOnCategory(e, catName)
                  }
                }}
                className={`space-y-4 scroll-mt-20 transition-opacity ${
                  draggedCategory === catName ? 'opacity-40' : ''
                }`}
              >
                {/* Category drop before indicator line */}
                {draggedCategory &&
                  dragOverCategoryTarget?.name === catName &&
                  dragOverCategoryTarget.position === 'before' && (
                    <div className="h-1 bg-primary rounded-full pointer-events-none mb-3" />
                  )}

                {/* SunPanel Style Group Header Title */}
                <div
                  onDragOver={(e) => {
                    if (draggedCategory) return
                    setDragOverItem(null)
                    handleCategoryDragOver(e, catName)
                  }}
                  onDrop={(e) => {
                    if (draggedCategory) return
                    handleDropOnCategory(e, catName)
                  }}
                  className={`flex items-center justify-between pb-1 p-1.5 -m-1.5 rounded-xl transition-colors ${
                    draggedItem && dragOverCategory === catName && draggedItem?.category !== catName
                      ? 'bg-accent-soft ring-1 ring-accent'
                      : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {/* Gradient accent vertical bar with drag handle */}
                    <div
                      draggable={!search.trim()}
                      onDragStart={(e) => handleCategoryDragStart(e, catName)}
                      onDragEnd={handleCategoryDragEnd}
                      className={`relative flex items-center justify-center p-1 -m-1 transition-all ${
                        search.trim()
                          ? 'cursor-default'
                          : 'cursor-grab active:cursor-grabbing hover:scale-110'
                      }`}
                      title={search.trim() ? undefined : `按住竖线拖动可调整「${catName}」分组顺序`}
                    >
                      <div
                        className={`w-1.5 h-4.5 rounded-full bg-primary hover:bg-primary-hover transition-colors pointer-events-none ${
                          draggedCategory === catName
                            ? 'scale-125 ring-2 ring-accent '
                            : ''
                        }`}
                      />
                    </div>
                    <h3 className="text-base font-semibold text-ink tracking-tight flex items-center gap-2">
                      <span>{catName}</span>
                      <span className="text-[11px] font-mono font-medium text-muted px-2 py-0.5 rounded-full bg-surface border border-border">
                        {groupList.length}
                      </span>
                    </h3>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Decorative subtle separator line */}
                    <div className="hidden sm:block w-24 md:w-48 h-px bg-border" />

                    {/* Quick Add into this group */}
                    <button
                      type="button"
                      onClick={() => handleOpenAdd(catName)}
                      className="flex items-center gap-1 px-2.5 py-1 text-muted hover:text-accent hover:bg-raised rounded-lg text-xs transition-colors cursor-pointer"
                      title={`在此分组「${catName}」中添加新书签`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span className="text-[11px] font-medium hidden sm:inline">添加</span>
                    </button>
                  </div>
                </div>

                {/* Grid of Cards under this Group Title */}
                <div
                  onDragOver={(e) => {
                    if (draggedCategory) return
                    handleCategoryDragOver(e, catName)
                  }}
                  onDrop={(e) => {
                    if (draggedCategory) return
                    handleDropOnCategory(e, catName)
                  }}
                  className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4 p-2 -m-2 rounded-2xl transition-all duration-200 min-h-[50px] ${
                    draggedItem && dragOverCategory === catName && draggedItem?.category !== catName
                      ? 'bg-accent-soft ring-1 ring-accent'
                      : ''
                  }`}
                >
                  {groupList.map((item) => {
                    const isBeingDragged = draggedItem?.id === item.id
                    const isDragTarget = dragOverItem?.id === item.id

                    return (
                      <div key={item.id} className="relative">
                        {/* Drop before indicator line */}
                        {isDragTarget && dragOverItem.position === 'before' && (
                          <div className="absolute -left-2 top-1 bottom-1 w-1 bg-primary rounded-full z-30 pointer-events-none" />
                        )}

                        <div
                          data-nav-card
                          role="button"
                          tabIndex={0}
                          onDragOver={(e) => handleCardDragOver(e, item)}
                          onDrop={(e) => handleDropOnCard(e, item)}
                          onClick={(e) => handleCardClick(e, item)}
                          onAuxClick={(e) => handleCardAuxClick(e, item)}
                          onKeyDown={(e) => handleCardKeyDown(e, item)}
                          onContextMenu={(e) => handleContextMenu(e, item)}
                          className={`nav-card group relative h-24 p-3 bg-surface hover:bg-accent-soft focus-visible:bg-accent-soft border transition-all duration-200 flex flex-col shadow-panel select-none outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer ${
                            isBeingDragged
                              ? 'opacity-40 scale-[0.98] border-dashed border-accent-border bg-accent-soft shadow-none'
                              : isDragTarget
                              ? 'border-accent-border ring-2 ring-accent bg-raised'
                              : 'border-border hover:border-accent-border'
                          }`}
                          title={`${item.title}${item.description ? `\n${item.description}` : ''}\n\n${search.trim() ? '点击打开 • 右键呼出操作菜单' : '点击打开 • 右上角六点可拖拽排序 • 右键呼出操作菜单'}`}
                        >
                          {/* Grip drag handle icon (six dots handle in top right corner) */}
                          {!search.trim() && (
                            <div
                              draggable
                              onDragStart={(e) => handleDragStart(e, item)}
                              onDragEnd={handleDragEnd}
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                              className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 w-6 h-6 flex items-center justify-center rounded-lg text-muted opacity-30 group-hover:opacity-80 hover:!opacity-100 hover:text-accent hover:bg-raised cursor-grab active:cursor-grabbing transition-all z-10"
                              title="按住六点图标拖动可排序或跨分类移动"
                            >
                              <GripVertical className="w-3.5 h-3.5 pointer-events-none" />
                            </div>
                          )}

                          <div className="flex h-8 shrink-0 items-center gap-3 pr-6 pointer-events-none select-none">
                            {renderItemBadge(item)}
                            <h4 className="flex-1 min-w-0 font-semibold text-ink text-sm leading-5 tracking-tight truncate group-hover:text-accent transition-colors">
                              {item.title}
                            </h4>
                          </div>
                          <p className="mt-0.5 h-9 shrink-0 text-xs text-muted line-clamp-2 leading-[1.125rem] wrap-anywhere pointer-events-none select-none">
                            {item.description || '点击直达服务'}
                          </p>
                        </div>

                        {/* Drop after indicator line */}
                        {isDragTarget && dragOverItem.position === 'after' && (
                          <div className="absolute -right-2 top-1 bottom-1 w-1 bg-primary rounded-full z-30 pointer-events-none" />
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Category drop after indicator line */}
                {draggedCategory &&
                  dragOverCategoryTarget?.name === catName &&
                  dragOverCategoryTarget.position === 'after' && (
                    <div className="h-1 bg-primary rounded-full pointer-events-none mt-3" />
                  )}
              </section>
            )
          })}
        </div>
      )}

      {/* Floating Right-click Context Menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-50 bg-transparent"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              setContextMenu(null)
            }}
          />

          <div
            style={{ left: contextMenu.x, top: contextMenu.y }}
            className="fixed z-50 w-44 bg-surface border border-border rounded-xl shadow-float py-1.5 animate-in fade-in zoom-in-95 duration-100 select-none text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3.5 py-1.5 border-b border-border text-[10px] text-muted truncate font-semibold">
              {contextMenu.item.title}
            </div>

            <a
              href={contextMenu.item.url}
              target="_blank"
              rel="noreferrer"
              onClick={() => setContextMenu(null)}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-body hover:text-ink hover:bg-raised transition-colors cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 text-accent" />
              <span>在新标签页打开</span>
            </a>

            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(contextMenu.item.url)
                setContextMenu(null)
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-body hover:text-ink hover:bg-raised transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5 text-accent" />
              <span>复制链接地址</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const targetItem = contextMenu.item
                setContextMenu(null)
                handleOpenEdit(targetItem)
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-body hover:text-accent hover:bg-raised transition-colors cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5 text-accent" />
              <span>编辑服务书签</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                const targetId = contextMenu.item.id
                setContextMenu(null)
                handleDeleteItem(e, targetId)
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-danger hover:bg-danger-soft transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>删除此书签</span>
            </button>
          </div>
        </>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay backdrop-blur-sm overflow-y-auto">
          <form
            onSubmit={handleSave}
            className="w-full max-w-lg bg-surface border border-border rounded-2xl p-6 shadow-float space-y-4 animate-in fade-in zoom-in-95 my-8"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-accent-soft text-accent border border-accent-border">
                  <Compass className="w-4 h-4" />
                </div>
                <h3 className="text-base font-semibold text-ink">
                  {editingItem ? '编辑服务书签' : '添加服务书签'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-muted hover:text-ink p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Live Preview Card (Consistent with the new horizontal layout) */}
            <div className="bg-inset border border-border rounded-xl sm:rounded-2xl p-3.5 flex items-center gap-4">
              {renderModalPreviewIcon()}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm sm:text-base font-semibold text-ink truncate">
                    {title || '服务标题预览'}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-raised text-muted border border-border">
                    {category || '常用'}
                  </span>
                </div>
                <p className="text-xs text-muted truncate mt-1">
                  {description || url || '家庭服务简短说明'}
                </p>
              </div>
              <span className="text-[10px] text-accent font-mono px-2 py-1 rounded-lg bg-accent-soft border border-accent-border shrink-0">
                实时预览
              </span>
            </div>

            {/* Basic Info Inputs */}
            <div>
              <label className="block text-xs font-semibold text-body mb-1">
                服务标题 <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如: Jellyfin、OpenWrt、qBittorrent"
                required
                className="w-full px-3 py-2 bg-field border border-border-strong rounded-lg text-xs sm:text-sm text-ink focus:outline-none focus:border-accent-border"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-body mb-1">
                目标地址 (URL) <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://192.168.1.100:8096"
                required
                className="w-full px-3 py-2 bg-field border border-border-strong rounded-lg text-xs sm:text-sm text-ink font-mono focus:outline-none focus:border-accent-border"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-body mb-1">所属分组 / 分类</label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="常用 / 媒体娱乐 / 网络路由"
                  className="w-full px-3 py-2 bg-field border border-border-strong rounded-lg text-xs sm:text-sm text-ink focus:outline-none focus:border-accent-border"
                />
                {categoryList.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                    <span className="text-[10px] text-muted">已有分组:</span>
                    {categoryList.map((catName) => (
                      <button
                        key={catName}
                        type="button"
                        onClick={() => setCategory(catName)}
                        className={`px-2 py-0.5 rounded-lg text-[10px] transition-colors cursor-pointer ${
                          category === catName
                            ? 'bg-accent-soft text-accent border border-accent-border'
                            : 'bg-raised hover:bg-raised-strong text-muted hover:text-ink border border-border'
                        }`}
                      >
                        {catName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-body mb-1">简短说明</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="家庭私人影视音视频中心"
                  className="w-full px-3 py-2 bg-field border border-border-strong rounded-lg text-xs sm:text-sm text-ink focus:outline-none focus:border-accent-border"
                />
              </div>
            </div>

            {/* Icon Selection Section with Library Reuse */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-body">
                  图标选择与复用 (160×160 统一规格)
                </label>
                <div className="flex items-center p-0.5 rounded-lg bg-canvas border border-border text-[11px]">
                  <button
                    type="button"
                    onClick={() => setIconTab('preset')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                      iconTab === 'preset'
                        ? 'bg-primary text-on-primary font-semibold shadow-panel'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    预设图标
                  </button>
                  <button
                    type="button"
                    onClick={() => setIconTab('library')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                      iconTab === 'library'
                        ? 'bg-primary text-on-primary font-semibold shadow-panel'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    图标库{iconsLoaded ? ` (${customIcons.length})` : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIconTab('upload')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                      iconTab === 'upload'
                        ? 'bg-primary text-on-primary font-semibold shadow-panel'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    本地上传
                  </button>
                  <button
                    type="button"
                    onClick={() => setIconTab('url')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                      iconTab === 'url'
                        ? 'bg-primary text-on-primary font-semibold shadow-panel'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    URL 下载
                  </button>
                </div>
              </div>

              {iconTab === 'preset' && (
                /* Preset Icons Grid */
                <div className="grid grid-cols-6 gap-2 p-3 bg-inset border border-border rounded-xl max-h-48 overflow-y-auto">
                  {PRESET_ICONS.map((p) => {
                    const Comp = ICON_MAP[p.key] || Globe
                    const isSelected = selectedIconId === null && selectedPresetIcon === p.key
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => {
                          setSelectedPresetIcon(p.key)
                          setSelectedIconId(null)
                        }}
                        className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-accent-soft text-accent border border-accent-border ring-2 ring-accent'
                            : 'bg-raised text-muted hover:text-ink hover:bg-raised border border-border'
                        }`}
                        title={p.label}
                      >
                        <Comp className="w-5 h-5 mb-1" />
                        <span className="text-[10px] truncate max-w-full">{p.label}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              {iconTab === 'library' && (
                /* Uploaded Icons Library (Select & Reuse) */
                <div className="p-3 bg-inset border border-border rounded-xl max-h-56 overflow-y-auto">
                  {iconsError && (
                    <div role="alert" className="mb-3 text-xs text-danger flex items-center justify-between gap-2">
                      <span>{iconsError}</span>
                      <button type="button" onClick={() => setLibraryRetry((value) => value + 1)} className="text-accent cursor-pointer">重试</button>
                    </div>
                  )}
                  {iconsLoading && <p role="status" className="text-center py-3 text-xs text-muted">正在加载图标库...</p>}
                  {!iconsLoading && !iconsError && customIcons.length === 0 ? (
                    <div className="text-center py-6 text-muted text-xs space-y-2">
                      <Library className="w-6 h-6 mx-auto opacity-50" />
                      <p>暂无已上传的自定义图标</p>
                      <button
                        type="button"
                        onClick={() => setIconTab('upload')}
                        className="px-3 py-1.5 bg-accent-soft border border-accent-border text-accent hover:bg-accent-soft rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        立即上传第一个图标
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {customIcons.map((ic) => {
                        const isSelected = selectedIconId === ic.id
                        return (
                          <div
                            key={ic.id}
                            onClick={() => {
                              setSelectedIconId(ic.id)
                              setSelectedPresetIcon('')
                            }}
                            className={`group relative flex items-center gap-2.5 p-2 rounded-xl border transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-accent-soft border-accent-border ring-2 ring-accent'
                                : 'bg-surface hover:bg-raised border-border'
                            }`}
                          >
                            <div className="w-9 h-9 rounded-lg bg-raised border border-border flex items-center justify-center overflow-hidden shrink-0">
                              <NavIconImage
                                iconId={ic.id}
                                alt={ic.name}
                                refreshKey={iconRefreshKey}
                                initialData={iconSeeds[ic.id]}
                                className="w-full h-full object-contain p-1"
                                fallback={<ImageIcon className="w-4 h-4 text-muted" />}
                              />
                            </div>

                            <div className="flex-1 min-w-0 text-left">
                              <div className="text-xs font-semibold text-ink truncate">
                                {ic.name || `图标 #${ic.id}`}
                              </div>
                              <div className="text-[10px] text-muted font-mono">
                                ID: {ic.id}
                              </div>
                            </div>

                            {isSelected && (
                              <div className="w-4 h-4 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0">
                                <Check className="w-2.5 h-2.5 stroke-[3]" />
                              </div>
                            )}

                            {/* Delete custom icon button */}
                            <button
                              type="button"
                              onClick={(e) => handleDeleteCustomIcon(e, ic.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-muted hover:text-danger rounded-lg hover:bg-danger-soft transition-all cursor-pointer"
                              title="删除此图标"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {iconTab === 'upload' && (
                /* Custom Image Upload Zone */
                <div className="p-4 bg-inset border border-border rounded-xl space-y-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-body">图标名称备注:</label>
                    <input
                      type="text"
                      value={newIconName}
                      onChange={(e) => setNewIconName(e.target.value)}
                      placeholder={title || '如: Jellyfin Logo'}
                      className="flex-1 px-3 py-1.5 bg-field border border-border-strong rounded-lg text-xs text-ink focus:outline-none focus:border-accent-border"
                    />
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleUploadNewIcon(e.target.files[0])
                      }
                    }}
                  />

                  {/* Drag & Drop Upload Dropzone */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault()
                      setDragOver(true)
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                      dragOver
                        ? 'border-accent-border bg-accent-soft text-accent'
                        : 'border-border hover:border-accent-border hover:bg-raised text-muted'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-accent-soft text-accent border border-accent-border flex items-center justify-center mx-auto mb-2">
                      {uploadLoading ? (
                        <div className="w-5 h-5 border-2 border-accent-border border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Upload className="w-5 h-5" />
                      )}
                    </div>
                    <div className="text-xs font-semibold text-ink">
                      {uploadLoading ? '正在规格化并存入图标库...' : '点击或将图片拖拽至此上传'}
                    </div>
                    <p className="text-[10px] text-muted mt-1">
                      支持 PNG, JPG, WebP, SVG, ICO • 前端 Canvas 自动居中等比裁剪为 160×160 并存入独立图标库
                    </p>
                  </div>
                </div>
              )}

              {iconTab === 'url' && (
                /* Remote URL Icon Fetch & Preview Zone */
                <div className="p-4 bg-inset border border-border rounded-xl space-y-4">
                  {!previewIcon ? (
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <label className="text-xs font-medium text-body shrink-0">图标 URL 地址:</label>
                        <input
                          type="url"
                          value={iconFetchUrl}
                          onChange={(e) => {
                            setIconFetchUrl(e.target.value)
                            if (fetchError) setFetchError('')
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleFetchIcon()
                            }
                          }}
                          placeholder="https://... 或 http://... (支持 png, jpg, webp, svg, ico)"
                          className="flex-1 px-3 py-2 bg-field border border-border-strong rounded-lg text-xs text-ink focus:outline-none focus:border-accent-border font-mono"
                        />
                        <button
                          type="button"
                          onClick={handleFetchIcon}
                          disabled={fetchLoading || !iconFetchUrl.trim()}
                          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-hover text-on-primary rounded-lg text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0 shadow-panel"
                        >
                          {fetchLoading ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          <span>{fetchLoading ? '抓取中...' : '抓取预览'}</span>
                        </button>
                      </div>

                      {url.trim() && !iconFetchUrl && (
                        <div className="flex items-center justify-between text-[11px] text-muted pt-1">
                          <span>尝试提取当前书签域名的 Favicon？</span>
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                const parsed = new URL(url.trim())
                                setIconFetchUrl(`${parsed.origin}/favicon.ico`)
                              } catch {
                                setIconFetchUrl(url.trim().replace(/\/+$/, '') + '/favicon.ico')
                              }
                            }}
                            className="text-accent hover:text-accent hover:underline cursor-pointer"
                          >
                            填入书签 Favicon URL
                          </button>
                        </div>
                      )}

                      {fetchError && (
                        <div className="p-3 bg-danger-soft border border-danger-border rounded-lg text-danger text-xs flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>{fetchError}</span>
                        </div>
                      )}

                      <p className="text-[10px] text-muted leading-relaxed">
                        💡 服务端直接代为发起网络请求，不受浏览器跨域 (CORS) 限制；原生支持局域网自签名 HTTPS 证书及公网图标。下载后将先展示预览，确认后再存入图标库。
                      </p>
                    </div>
                  ) : (
                    /* Preview and Decision Zone */
                    <div className="space-y-4 animate-in fade-in duration-200">
                      <div className="text-xs font-semibold text-body flex items-center justify-between">
                        <span>图标预览 (尚未入库)</span>
                        <span className="text-[11px] font-normal text-success flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> 抓取成功，请确认是否入库
                        </span>
                      </div>

                      <div className="flex items-center gap-4 p-3.5 bg-surface border border-border rounded-xl">
                        <div className="w-16 h-16 rounded-xl bg-accent-soft border border-accent-border p-2 flex items-center justify-center shrink-0 overflow-hidden shadow-inner">
                          <img
                            src={previewIcon.data}
                            alt="Preview"
                            className="w-full h-full object-contain"
                          />
                        </div>

                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <label className="text-[11px] text-muted shrink-0">图标名称:</label>
                            <input
                              type="text"
                              value={previewIcon.suggestedName}
                              onChange={(e) =>
                                setPreviewIcon((prev) => prev ? { ...prev, suggestedName: e.target.value } : null)
                              }
                              placeholder="给图标命名"
                              className="flex-1 px-2.5 py-1 bg-field border border-border-strong rounded-lg text-xs text-ink focus:outline-none focus:border-accent-border"
                            />
                          </div>
                          <div className="text-[11px] text-muted font-mono">
                            格式: <span className="text-accent">{previewIcon.mimeType}</span> • 大小: {Math.round((previewIcon.size / 1024) * 10) / 10} KB
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewIcon(null)
                            setFetchError('')
                          }}
                          disabled={saveFetchedLoading}
                          className="px-3.5 py-1.5 rounded-lg border border-border text-xs font-medium text-body hover:bg-raised transition-colors cursor-pointer disabled:opacity-50"
                        >
                          重新输入 URL
                        </button>
                        <button
                          type="button"
                          onClick={handleSavePreviewIcon}
                          disabled={saveFetchedLoading}
                          className="flex items-center gap-1.5 px-4 py-1.5 bg-primary hover:bg-primary-hover text-on-primary rounded-lg text-xs font-semibold transition-all shadow-panel cursor-pointer disabled:opacity-50"
                        >
                          {saveFetchedLoading ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          <span>{saveFetchedLoading ? '正在入库...' : '确认入库并选用'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg border border-border text-xs font-medium text-body hover:bg-raised transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={uploadLoading}
                className="px-5 py-2 bg-primary hover:bg-primary-hover text-on-primary font-semibold rounded-lg text-xs shadow-panel active:translate-y-px transition-all cursor-pointer disabled:opacity-50"
              >
                保存书签
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

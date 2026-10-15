import { startAuthentication, startRegistration } from '@simplewebauthn/browser'

const API_BASE = '/api'

export function getToken(): string | null {
  return localStorage.getItem('token')
}

export function setToken(token: string) {
  localStorage.setItem('token', token)
}

export function removeToken() {
  localStorage.removeItem('token')
}

export async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers = new Headers(options.headers || {})

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })

  if (res.status === 401 && !path.includes('/auth/login') && !path.includes('/auth/status')) {
    removeToken()
    window.location.reload()
  }

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || `请求失败 (${res.status})`)
  }

  return data
}

export interface User {
  id: number
  username: string
  passkeys?: {
    id: number
    deviceName: string
    createdAt: string
  }[]
}

export interface NavIcon {
  id: number
  name: string
  data: string
  createdAt?: string
  updatedAt?: string
}

export interface FetchIconResult {
  data: string
  mimeType: string
  size: number
  filename: string
}

export interface NavItem {
  id: number
  title: string
  url: string
  icon: string
  iconId?: number | null
  customIcon?: NavIcon | null
  category: string
  description: string
  orderIndex: number
}

export interface PVEOnlineStatus {
  online: boolean
  node: string
  pveConfigured: boolean
  wolConfigured: boolean
  wolDeviceBound?: boolean
  wolDeviceId?: number | null
  wolDeviceName?: string
  wolDeviceMac?: string
  wolUrl?: string
}

export interface WOLDevice {
  id: number
  name: string
  mac: string
  createdAt?: string
  updatedAt?: string
}

export interface WOLConfig {
  configured: boolean
  host?: string
  port?: number
  useTls?: boolean
  tlsSkipVerify?: boolean
  packetTemplate?: string
  enabled?: boolean
  updatedAt?: string
}

export interface PVEGuest {
  vmid: number
  name: string
  type: 'qemu' | 'lxc' | string
  status: 'running' | 'stopped' | string
  cpu?: number
  cpus?: number
  mem?: number
  maxmem?: number
  uptime?: number
  netin?: number
  netout?: number
}

export const api = {
  auth: {
    getStatus: () => request<{ initialized: boolean; hasPasskey: boolean }>('/auth/status'),
    register: (username: string, password: string) =>
      request<{ token: string; user: User }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    login: (username: string, password: string) =>
      request<{ token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    me: () => request<User>('/auth/me'),

    // Passkey registration
    passkeyRegister: async (deviceName: string = '我的设备') => {
      const { options, sessionId } = await request<{ options: any; sessionId: string }>(
        '/auth/passkey/register/begin',
        { method: 'POST' }
      )

      const optionsJSON = JSON.parse(JSON.stringify(options?.publicKey || options))
      if (optionsJSON.authenticatorSelection?.requireResidentKey === false) {
        delete optionsJSON.authenticatorSelection.requireResidentKey
      }
      if (
        optionsJSON.rp?.id &&
        window.location.hostname &&
        optionsJSON.rp.id !== window.location.hostname &&
        !window.location.hostname.match(/^\d+\.\d+\.\d+\.\d+$/)
      ) {
        optionsJSON.rp.id = window.location.hostname
      }

      const attResp = await startRegistration({ optionsJSON })

      return await request(
        `/auth/passkey/register/finish?sessionId=${sessionId}&deviceName=${encodeURIComponent(deviceName)}`,
        {
          method: 'POST',
          body: JSON.stringify(attResp),
        }
      )
    },

    // Passkey login
    passkeyLogin: async (username?: string) => {
      const url = username
        ? `/auth/passkey/login/begin?username=${encodeURIComponent(username)}`
        : '/auth/passkey/login/begin'
      const { options, sessionId } = await request<{ options: any; sessionId: string }>(url, {
        method: 'POST',
      })

      const optionsJSON = JSON.parse(JSON.stringify(options?.publicKey || options))
      if (optionsJSON.rpId && window.location.hostname && optionsJSON.rpId !== window.location.hostname) {
        optionsJSON.rpId = window.location.hostname
      }

      const asseResp = await startAuthentication({ optionsJSON })

      const finishUrl = username
        ? `/auth/passkey/login/finish?sessionId=${sessionId}&username=${encodeURIComponent(username)}`
        : `/auth/passkey/login/finish?sessionId=${sessionId}`
      return await request<{ token: string; user: User }>(finishUrl, {
        method: 'POST',
        body: JSON.stringify(asseResp),
      })
    },

    deletePasskey: (id: number) => request(`/auth/passkey/${id}`, { method: 'DELETE' }),
    logout: () => {
      removeToken()
    },
  },

  nav: {
    list: () => request<NavItem[]>('/nav'),
    create: (data: Partial<NavItem>) =>
      request<NavItem>('/nav', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: number, data: Partial<NavItem>) =>
      request<NavItem>(`/nav/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: number) => request(`/nav/${id}`, { method: 'DELETE' }),
    listIcons: () => request<NavIcon[]>('/nav/icons'),
    createIcon: (data: { name: string; data: string }) =>
      request<NavIcon>('/nav/icons', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    deleteIcon: (id: number) => request(`/nav/icons/${id}`, { method: 'DELETE' }),
    fetchIcon: (url: string) =>
      request<FetchIconResult>('/nav/icons/fetch', {
        method: 'POST',
        body: JSON.stringify({ url }),
      }),
    reorder: (items: { id: number; category: string; orderIndex: number }[]) =>
      request('/nav/reorder', {
        method: 'POST',
        body: JSON.stringify(items),
      }),
  },

  pve: {
    getOnline: () => request<PVEOnlineStatus>('/pve/online'),
    start: () =>
      request<{ message: string; mac?: string }>('/pve/start', {
        method: 'POST',
      }),
    wake: () =>
      request<{ message: string; mac?: string }>('/pve/wake', {
        method: 'POST',
      }),
    shutdown: (confirm: boolean = true, node?: string) =>
      request('/pve/shutdown', {
        method: 'POST',
        body: JSON.stringify({ confirm, node }),
      }),
    reboot: (confirm: boolean = true, node?: string) =>
      request('/pve/reboot', {
        method: 'POST',
        body: JSON.stringify({ confirm, node }),
      }),
    getConfig: () => request<any>('/pve/config'),
    saveConfig: (data: any) =>
      request('/pve/config', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    testConnection: (data?: any) =>
      request('/pve/test', {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }),
    getStatus: (node?: string) =>
      request<any>(node ? `/pve/status?node=${node}` : '/pve/status'),
    getGuests: (node?: string) =>
      request<PVEGuest[]>(node ? `/pve/guests?node=${node}` : '/pve/guests'),
    startGuest: (type: string, vmid: number, node?: string) =>
      request<{ message: string }>(`/pve/guests/${type}/${vmid}/start${node ? `?node=${node}` : ''}`, {
        method: 'POST',
      }),
    shutdownGuest: (type: string, vmid: number, node?: string) =>
      request<{ message: string }>(`/pve/guests/${type}/${vmid}/shutdown${node ? `?node=${node}` : ''}`, {
        method: 'POST',
      }),
    rebootGuest: (type: string, vmid: number, node?: string) =>
      request<{ message: string }>(`/pve/guests/${type}/${vmid}/reboot${node ? `?node=${node}` : ''}`, {
        method: 'POST',
      }),
    stopGuest: (type: string, vmid: number, node?: string) =>
      request<{ message: string }>(`/pve/guests/${type}/${vmid}/stop${node ? `?node=${node}` : ''}`, {
        method: 'POST',
      }),
  },

  wol: {
    getConfig: () => request<WOLConfig>('/wol/config'),
    saveConfig: (data: {
      host: string
      port: number
      useTls: boolean
      tlsSkipVerify: boolean
      packetTemplate?: string
    }) =>
      request<{
        message: string
        configured: boolean
        host: string
        port: number
        useTls: boolean
        tlsSkipVerify: boolean
        packetTemplate: string
        updatedAt?: string
      }>('/wol/config', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    deleteConfig: () =>
      request<{ message: string }>('/wol/config', {
        method: 'DELETE',
      }),
    getDevices: () => request<WOLDevice[]>('/wol/devices'),
    createDevice: (data: { name: string; mac: string }) =>
      request<WOLDevice>('/wol/devices', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateDevice: (id: number, data: { name: string; mac: string }) =>
      request<WOLDevice>(`/wol/devices/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteDevice: (id: number) =>
      request<{ message: string }>(`/wol/devices/${id}`, {
        method: 'DELETE',
      }),
    wakeDevice: (id: number) =>
      request<{ message: string; mac?: string }>(`/wol/devices/${id}/wake`, {
        method: 'POST',
      }),
    wake: (data?: { deviceId?: number; mac?: string }) =>
      request<{ message: string; mac?: string }>('/wol/wake', {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }),
  },
}

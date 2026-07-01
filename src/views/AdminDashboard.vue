<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { postJson } from '../lib/api.js'
import { ACTION_STATUS_OPTIONS, REGION_META, RIR_CATEGORY_OPTIONS } from '../lib/tosfOptions.js'

const SESSION_KEY = 'tosf_admin_session'
const PAGE_SIZE_OPTIONS = [25, 50, 100, 'all']

const login = reactive({ email: '', password: '' })
const session = ref(null)
const loading = ref(false)
const loginError = ref('')
const rows = ref([])
const adminError = ref('')
const portalOpen = ref(true)
const activeTab = ref('summary')
const pageSize = ref(25)
const currentPage = ref(1)
const sort = reactive({ key: 'timestamp', dir: 'desc' })
const filters = reactive({ regionCode: '', actionStatus: '', rirCategory: '', search: '' })

const isLoggedIn = computed(() => !!session.value?.token)
const totalSubmissions = computed(() => rows.value.length)
const filteredRows = computed(() => {
  const query = filters.search.trim().toLowerCase()
  return rows.value.filter((row) => {
    if (filters.regionCode && row.regionCode !== filters.regionCode) return false
    if (filters.actionStatus && row.actionStatus !== filters.actionStatus) return false
    if (filters.rirCategory && row.rirCategory !== filters.rirCategory) return false
    if (!query) return true
    return [row.submissionId, row.heiName, row.uii, row.regionLabel, row.submittedByName, row.submittedByEmail]
      .join(' ')
      .toLowerCase()
      .includes(query)
  })
})

const sortedRows = computed(() => {
  const key = sort.key
  const dir = sort.dir === 'asc' ? 1 : -1
  return [...filteredRows.value].sort((a, b) => {
    const av = a[key] ?? ''
    const bv = b[key] ?? ''
    if (typeof av === 'number' || typeof bv === 'number') return ((Number(av) || 0) - (Number(bv) || 0)) * dir
    return String(av).localeCompare(String(bv)) * dir
  })
})

const totalPages = computed(() => pageSize.value === 'all' ? 1 : Math.max(1, Math.ceil(sortedRows.value.length / Number(pageSize.value))))
const pagedRows = computed(() => {
  if (pageSize.value === 'all') return sortedRows.value
  const size = Number(pageSize.value)
  const start = (currentPage.value - 1) * size
  return sortedRows.value.slice(start, start + size)
})

const pageRange = computed(() => {
  if (!sortedRows.value.length) return '0-0'
  if (pageSize.value === 'all') return `1-${sortedRows.value.length}`
  const start = (currentPage.value - 1) * Number(pageSize.value) + 1
  const end = Math.min(sortedRows.value.length, start + Number(pageSize.value) - 1)
  return `${start}-${end}`
})

const statusCounts = computed(() => countBy(rows.value, 'actionStatus'))
const rirCounts = computed(() => countBy(rows.value, 'rirCategory'))
const decreaseTotal = computed(() =>
  (statusCounts.value['Decrease: within RIR'] || 0) +
  (statusCounts.value['Decrease: from above RIR to within RIR'] || 0) +
  (statusCounts.value['Application below the RIR is decreased'] || 0),
)

const summaryItems = computed(() => [
  { label: 'Total TOSF Applications Received', value: totalSubmissions.value },
  { label: 'Below the applicable RIR', value: rirCounts.value['Below the applicable RIR'] || 0 },
  { label: 'Equivalent to the applicable RIR', value: rirCounts.value['Equivalent to the applicable RIR'] || 0 },
  { label: 'Higher than the RIR', value: rirCounts.value['Higher than the RIR'] || 0 },
  { label: 'CHEDRO Approved', value: statusCounts.value['CHEDRO Approved'] || 0 },
  { label: 'CHEDRO Denied', value: statusCounts.value['CHEDRO Denied'] || 0 },
  { label: 'HEIs that Agreed to Defer Implementation', value: statusCounts.value['HEI agreed to defer implementation'] || 0 },
  { label: 'HEIs that Will Proceed with AY 2026-2027', value: statusCounts.value['HEI will proceed with AY 2026-2027'] || 0 },
  { label: 'HEIs which decreased their RIR', value: decreaseTotal.value },
  { label: 'Decrease: within RIR', value: statusCounts.value['Decrease: within RIR'] || 0, indent: true },
  { label: 'Decrease: from above RIR to within RIR', value: statusCounts.value['Decrease: from above RIR to within RIR'] || 0, indent: true },
  { label: 'Application below the RIR is decreased', value: statusCounts.value['Application below the RIR is decreased'] || 0, indent: true },
  { label: 'HEI under consideration, pending final decision', value: statusCounts.value['Under consideration, pending final decision'] || 0 },
  { label: 'No Response from HEI', value: statusCounts.value['No response from HEI'] || 0 },
  { label: 'Others', value: statusCounts.value.Others || 0 },
])

const regionalSummary = computed(() => REGION_META.map((region) => {
  const regionRows = rows.value.filter((row) => row.regionCode === region.code)
  const regionRir = countBy(regionRows, 'rirCategory')
  const regionStatus = countBy(regionRows, 'actionStatus')
  return {
    ...region,
    total: regionRows.length,
    below: regionRir['Below the applicable RIR'] || 0,
    equivalent: regionRir['Equivalent to the applicable RIR'] || 0,
    higher: regionRir['Higher than the RIR'] || 0,
    approved: regionStatus['CHEDRO Approved'] || 0,
    denied: regionStatus['CHEDRO Denied'] || 0,
    defer: regionStatus['HEI agreed to defer implementation'] || 0,
    proceed: regionStatus['HEI will proceed with AY 2026-2027'] || 0,
    decreased: (regionStatus['Decrease: within RIR'] || 0) + (regionStatus['Decrease: from above RIR to within RIR'] || 0) + (regionStatus['Application below the RIR is decreased'] || 0),
    pending: regionStatus['Under consideration, pending final decision'] || 0,
    noResponse: regionStatus['No response from HEI'] || 0,
    others: regionStatus.Others || 0,
  }
}))

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || 'Blank'
    acc[value] = (acc[value] || 0) + 1
    return acc
  }, {})
}

function restoreSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null')
    if (saved?.token) session.value = saved
  } catch {
    sessionStorage.removeItem(SESSION_KEY)
  }
}

async function adminLogin() {
  loginError.value = ''
  loading.value = true
  try {
    const data = await postJson({ action: 'adminLogin', email: login.email, password: login.password })
    session.value = { token: data.token, email: data.email, displayName: data.displayName, role: data.role }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session.value))
    login.password = ''
  } catch (err) {
    loginError.value = err?.message || 'Login failed.'
    loading.value = false
    return
  }
  // Auth succeeded: show the dashboard now and fetch rows in the background.
  // loadSubmissions keeps `loading` true until the rows arrive.
  loadSubmissions()
}

function logout() {
  session.value = null
  rows.value = []
  sessionStorage.removeItem(SESSION_KEY)
}

async function loadSubmissions() {
  if (!session.value?.token) return
  adminError.value = ''
  try {
    loading.value = true
    const data = await postJson({ action: 'listTosfSubmissions', adminToken: session.value.token, limit: 'all' })
    rows.value = Array.isArray(data.rows) ? data.rows : []
    if (typeof data.portalOpen === 'boolean') portalOpen.value = data.portalOpen
    currentPage.value = 1
  } catch (err) {
    adminError.value = err?.message || 'Unable to load submissions.'
    if (/session|token|expired/i.test(adminError.value)) logout()
  } finally {
    loading.value = false
  }
}

async function togglePortal() {
  if (!session.value?.token) return
  adminError.value = ''
  try {
    loading.value = true
    const data = await postJson({ action: 'setPortalStatus', adminToken: session.value.token, open: !portalOpen.value })
    portalOpen.value = !!data.portalOpen
  } catch (err) {
    adminError.value = err?.message || 'Unable to change portal status.'
  } finally {
    loading.value = false
  }
}

// Reset to the first page whenever filtering or page size changes so the
// current page never points past the end of the (smaller) result set.
watch(
  [() => filters.regionCode, () => filters.actionStatus, () => filters.rirCategory, () => filters.search, pageSize],
  () => { currentPage.value = 1 },
)

function setSort(key) {
  if (sort.key === key) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc'
  else {
    sort.key = key
    sort.dir = 'asc'
  }
}

function sortMark(key) {
  if (sort.key !== key) return ''
  return sort.dir === 'asc' ? '↑' : '↓'
}

function clearFilters() {
  filters.regionCode = ''
  filters.actionStatus = ''
  filters.rirCategory = ''
  filters.search = ''
  currentPage.value = 1
}

function csvEscape(value) {
  let str = String(value ?? '')
  // Neutralize spreadsheet formula injection: a cell starting with one of these
  // can be executed as a formula when the CSV is opened in Excel/Sheets.
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`
  if (!/[",\n]/.test(str)) return str
  return `"${str.replace(/"/g, '""')}"`
}

function exportCsv() {
  const headers = [
    'Timestamp', 'Submission ID', 'Region', 'RIR', 'UII', 'HEI Name', 'Province', 'City/Municipality',
    'TF Increase (%)', 'OSF Increase (%)', 'RIR Category', 'Action or Status', 'Other Specifics',
    'Remarks', 'Submitted By', 'Submitted Email', 'Position/Unit', 'Contact',
  ]
  const dataRows = sortedRows.value.map((row) => [
    row.timestamp, row.submissionId, row.regionLabel, row.rir, row.uii, row.heiName, row.province, row.cityMunicipality,
    row.proposedTfIncrease, row.proposedOsfIncrease, row.rirCategory, row.actionStatus, row.otherSpecifics,
    row.remarks, row.submittedByName, row.submittedByEmail, row.submittedByPosition, row.submittedByContact,
  ])
  const csv = [headers, ...dataRows].map((line) => line.map(csvEscape).join(',')).join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `tosf-consolidated-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

onMounted(async () => {
  restoreSession()
  if (session.value?.token) await loadSubmissions()
})
</script>

<template>
  <section class="mx-auto w-full max-w-[1600px]">
    <div v-if="!isLoggedIn" class="mx-auto max-w-md rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70">
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Admin Access</p>
      <h2 class="mt-2 text-2xl font-bold text-slate-950">TOSF Consolidation Dashboard</h2>
      <p class="mt-2 text-sm leading-6 text-slate-600">Sign in with the admin account seeded in the Apps Script Users sheet.</p>

      <form class="mt-6 space-y-4" @submit.prevent="adminLogin">
        <label class="block">
          <span class="text-sm font-semibold text-slate-800">Email</span>
          <input v-model="login.email" type="email" autocomplete="username" class="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900" />
        </label>
        <label class="block">
          <span class="text-sm font-semibold text-slate-800">Password</span>
          <input v-model="login.password" type="password" autocomplete="current-password" class="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900" />
        </label>
        <div v-if="loginError" class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{{ loginError }}</div>
        <button type="submit" :disabled="loading" class="w-full rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300">
          {{ loading ? 'Signing in...' : 'Sign in' }}
        </button>
      </form>
    </div>

    <div v-else class="space-y-6">
      <div class="flex flex-col gap-4 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/70 md:flex-row md:items-center md:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Admin Dashboard</p>
          <h2 class="mt-2 text-2xl font-bold text-slate-950">Consolidated TOSF Submissions</h2>
          <p class="mt-1 text-sm text-slate-600">Signed in as {{ session.displayName || session.email }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60" :disabled="loading" @click="loadSubmissions">
            <svg class="h-4 w-4" :class="loading ? 'animate-spin' : ''" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M4.6 5.5A6.5 6.5 0 0 1 16 8h-2.2l3 3.5L20 8h-2A8.5 8.5 0 0 0 3.2 5l1.4.5Zm10.8 9A6.5 6.5 0 0 1 4 12h2.2l-3-3.5L0 12h2a8.5 8.5 0 0 0 14.8 3l-1.4-.5Z" clip-rule="evenodd" />
            </svg>
            {{ loading ? 'Loading…' : 'Refresh' }}
          </button>
          <button class="rounded-2xl border px-4 py-2 text-sm font-semibold transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2" :class="portalOpen ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:border-emerald-700 focus-visible:ring-emerald-400' : 'border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-700 focus-visible:ring-amber-400'" @click="togglePortal">
            Portal: {{ portalOpen ? 'Open' : 'Closed' }}
          </button>
          <button class="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-700 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 transition hover:from-indigo-500 hover:to-indigo-600 hover:shadow-indigo-600/40 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2" @click="exportCsv">
            <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M10 2a1 1 0 0 1 1 1v7.6l2.3-2.3a1 1 0 0 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L9 10.6V3a1 1 0 0 1 1-1Z" />
              <path d="M3 14a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z" />
            </svg>
            Export CSV
          </button>
          <button class="rounded-2xl border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2" @click="logout">Logout</button>
        </div>
      </div>

      <div v-if="adminError" class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{{ adminError }}</div>

      <div class="grid gap-4 md:grid-cols-4">
        <div class="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/60">
          <p class="text-sm font-semibold text-slate-500">Total submissions</p>
          <p class="mt-2 text-4xl font-black text-slate-950">{{ totalSubmissions }}</p>
        </div>
        <div class="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/60">
          <p class="text-sm font-semibold text-slate-500">Above RIR</p>
          <p class="mt-2 text-4xl font-black text-rose-700">{{ rirCounts['Higher than the RIR'] || 0 }}</p>
        </div>
        <div class="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/60">
          <p class="text-sm font-semibold text-slate-500">Deferred</p>
          <p class="mt-2 text-4xl font-black text-slate-950">{{ statusCounts['HEI agreed to defer implementation'] || 0 }}</p>
        </div>
        <div class="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/60">
          <p class="text-sm font-semibold text-slate-500">Decreased</p>
          <p class="mt-2 text-4xl font-black text-slate-950">{{ decreaseTotal }}</p>
        </div>
      </div>

      <div class="rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
        <div class="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
          <div class="flex flex-wrap gap-2">
            <button class="rounded-2xl px-4 py-2 text-sm font-bold transition" :class="activeTab === 'summary' ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30' : 'border border-slate-300 text-slate-700 hover:border-slate-900'" @click="activeTab = 'summary'">Summary</button>
            <button class="rounded-2xl px-4 py-2 text-sm font-bold transition" :class="activeTab === 'regions' ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30' : 'border border-slate-300 text-slate-700 hover:border-slate-900'" @click="activeTab = 'regions'">Regional Table</button>
            <button class="rounded-2xl px-4 py-2 text-sm font-bold transition" :class="activeTab === 'details' ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30' : 'border border-slate-300 text-slate-700 hover:border-slate-900'" @click="activeTab = 'details'">HEI Details</button>
          </div>
          <p class="text-sm text-slate-500">{{ filteredRows.length }} matching rows</p>
        </div>

        <div v-if="activeTab === 'summary'" class="p-5">
          <div class="overflow-hidden rounded-2xl border border-slate-200">
            <table class="w-full divide-y divide-slate-200 text-sm">
              <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th class="px-4 py-3">Items</th><th class="w-32 px-4 py-3 text-right">Number</th></tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-for="item in summaryItems" :key="item.label">
                  <td class="px-4 py-3" :class="item.indent ? 'pl-10 text-slate-600' : 'font-semibold text-slate-900'">{{ item.label }}</td>
                  <td class="px-4 py-3 text-right font-black text-slate-950">{{ item.value }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-else-if="activeTab === 'regions'" class="w-full overflow-x-auto p-5">
          <table class="w-full min-w-[1300px] divide-y divide-slate-200 text-sm">
            <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th class="px-3 py-3">Region</th><th class="px-3 py-3 text-right">Private HEIs</th><th class="px-3 py-3 text-right">RIR</th><th class="px-3 py-3 text-right">Total</th>
                <th class="px-3 py-3 text-right">Below</th><th class="px-3 py-3 text-right">Equivalent</th><th class="px-3 py-3 text-right">Higher</th>
                <th class="px-3 py-3 text-right">Approved</th><th class="px-3 py-3 text-right">Denied</th><th class="px-3 py-3 text-right">Deferred</th><th class="px-3 py-3 text-right">Proceed</th>
                <th class="px-3 py-3 text-right">Decreased</th><th class="px-3 py-3 text-right">Pending</th><th class="px-3 py-3 text-right">No Response</th><th class="px-3 py-3 text-right">Others</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="region in regionalSummary" :key="region.code">
                <td class="px-3 py-3 font-semibold text-slate-900">{{ region.shortName }}</td><td class="px-3 py-3 text-right">{{ region.privateHeiCount }}</td><td class="px-3 py-3 text-right">{{ region.rir }}%</td><td class="px-3 py-3 text-right font-black">{{ region.total }}</td>
                <td class="px-3 py-3 text-right">{{ region.below }}</td><td class="px-3 py-3 text-right">{{ region.equivalent }}</td><td class="px-3 py-3 text-right">{{ region.higher }}</td>
                <td class="px-3 py-3 text-right">{{ region.approved }}</td><td class="px-3 py-3 text-right">{{ region.denied }}</td><td class="px-3 py-3 text-right">{{ region.defer }}</td><td class="px-3 py-3 text-right">{{ region.proceed }}</td>
                <td class="px-3 py-3 text-right">{{ region.decreased }}</td><td class="px-3 py-3 text-right">{{ region.pending }}</td><td class="px-3 py-3 text-right">{{ region.noResponse }}</td><td class="px-3 py-3 text-right">{{ region.others }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="p-5">
          <div class="grid gap-3 lg:grid-cols-4">
            <select v-model="filters.regionCode" class="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">All regions</option><option v-for="region in REGION_META" :key="region.code" :value="region.code">{{ region.shortName }}</option></select>
            <select v-model="filters.rirCategory" class="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">All RIR categories</option><option v-for="category in RIR_CATEGORY_OPTIONS" :key="category" :value="category">{{ category }}</option></select>
            <select v-model="filters.actionStatus" class="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">All statuses</option><option v-for="status in ACTION_STATUS_OPTIONS" :key="status" :value="status">{{ status }}</option></select>
            <div class="flex gap-2"><input v-model="filters.search" type="search" placeholder="Search HEI / UII / submitter" class="min-w-0 flex-1 rounded-2xl border border-slate-300 px-3 py-2 text-sm" /><button class="rounded-2xl border border-slate-300 px-3 py-2 text-sm font-semibold" @click="clearFilters">Clear</button></div>
          </div>

          <div class="mt-5 w-full overflow-x-auto rounded-2xl border border-slate-200">
            <table class="w-full min-w-[1500px] divide-y divide-slate-200 text-sm">
              <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="px-3 py-3"><button @click="setSort('timestamp')">Timestamp {{ sortMark('timestamp') }}</button></th>
                  <th class="px-3 py-3"><button @click="setSort('regionLabel')">Region {{ sortMark('regionLabel') }}</button></th>
                  <th class="px-3 py-3"><button @click="setSort('heiName')">HEI {{ sortMark('heiName') }}</button></th>
                  <th class="px-3 py-3 text-right"><button @click="setSort('proposedTfIncrease')">TF % {{ sortMark('proposedTfIncrease') }}</button></th>
                  <th class="px-3 py-3 text-right"><button @click="setSort('proposedOsfIncrease')">OSF % {{ sortMark('proposedOsfIncrease') }}</button></th>
                  <th class="px-3 py-3">RIR Category</th><th class="px-3 py-3">Action / Status</th><th class="px-3 py-3">Remarks</th><th class="px-3 py-3">Submitted By</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-if="loading"><td colspan="9" class="px-4 py-10 text-center text-slate-500">Loading submissions…</td></tr>
                <tr v-else-if="!pagedRows.length"><td colspan="9" class="px-4 py-10 text-center text-slate-500">No matching rows.</td></tr>
                <tr v-for="row in pagedRows" :key="row.submissionId" class="align-top">
                  <td class="px-3 py-3 text-xs text-slate-500">{{ row.timestamp }}<p class="font-mono">{{ row.submissionId }}</p></td>
                  <td class="px-3 py-3">{{ row.regionLabel }}<p class="text-xs text-slate-500">RIR {{ row.rir }}%</p></td>
                  <td class="px-3 py-3 font-semibold text-slate-900">{{ row.heiName }}<p class="text-xs font-normal text-slate-500">UII {{ row.uii || '—' }} • {{ row.province || '—' }} • {{ row.cityMunicipality || '—' }}</p></td>
                  <td class="px-3 py-3 text-right">{{ row.proposedTfIncrease ?? '—' }}</td>
                  <td class="px-3 py-3 text-right">{{ row.proposedOsfIncrease ?? '—' }}</td>
                  <td class="px-3 py-3"><span class="rounded-full px-2 py-1 text-xs font-bold" :class="row.rirCategory === 'Higher than the RIR' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'">{{ row.rirCategory }}</span></td>
                  <td class="px-3 py-3">{{ row.actionStatus }}<p v-if="row.otherSpecifics" class="text-xs text-slate-500">{{ row.otherSpecifics }}</p></td>
                  <td class="px-3 py-3 max-w-sm whitespace-pre-wrap text-slate-600">{{ row.remarks || '—' }}</td>
                  <td class="px-3 py-3">{{ row.submittedByName }}<p class="text-xs text-slate-500">{{ row.submittedByEmail }}</p></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="mt-4 flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-center gap-2">
              <span>Rows per page</span>
              <select v-model="pageSize" class="rounded-xl border border-slate-300 bg-white px-3 py-1.5"><option v-for="option in PAGE_SIZE_OPTIONS" :key="option" :value="option">{{ option === 'all' ? 'All' : option }}</option></select>
            </div>
            <div class="flex items-center gap-3">
              <span>{{ pageRange }} of {{ sortedRows.length }}</span>
              <button class="rounded-xl border border-slate-300 px-3 py-1.5 font-semibold disabled:opacity-50" :disabled="currentPage <= 1" @click="currentPage -= 1">Prev</button>
              <button class="rounded-xl border border-slate-300 px-3 py-1.5 font-semibold disabled:opacity-50" :disabled="currentPage >= totalPages" @click="currentPage += 1">Next</button>
              <span>Page {{ currentPage }} of {{ totalPages }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

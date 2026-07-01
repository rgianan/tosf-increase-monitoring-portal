<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { API_URL, SUBMIT_TOKEN, postJson } from '../lib/api.js'
import { parseCsv } from '../lib/csv.js'
import {
  ACTION_STATUS_OPTIONS,
  REQUIRED_ACTION_WITH_SPECIFICS,
  REGION_META,
  computeRirCategory,
  getRegionByCode,
  normalizeRegionCode,
  toNumberOrNull,
} from '../lib/tosfOptions.js'

const submitting = ref(false)
const loadingSchools = ref(false)
const submitError = ref('')
const submitSuccess = ref('')
const submissionId = ref('')
const portalOpen = ref(true)
const schools = ref([])
const schoolLoadError = ref('')
const schoolQuery = ref('')
const selectedSchool = ref(null)
const addedEntries = ref([])
const editingIndex = ref(null)

const allowedDomain = String(import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN || '').trim().toLowerCase()
const otp = reactive({
  email: '',
  code: '',
  requestId: '',
  sessionToken: '',
  verifiedEmail: '',
  sending: false,
  verifying: false,
  message: '',
  error: '',
})
const emailVerified = computed(() => !!otp.sessionToken && !!otp.verifiedEmail)

// Self-service management of the signed-in submitter's previous rows.
const managing = ref(false)
const myLoading = ref(false)
const mySubmissions = ref([])
const myError = ref('')
const myMessage = ref('')
const editingRowId = ref('')
const editRow = reactive({
  submissionId: '',
  heiName: '',
  regionLabel: '',
  rir: '',
  proposedTfIncrease: '',
  proposedOsfIncrease: '',
  actionStatus: '',
  otherSpecifics: '',
  remarks: '',
})
const editRowNeedsSpecifics = computed(() => editRow.actionStatus === REQUIRED_ACTION_WITH_SPECIFICS)
const editRowCategory = computed(() => computeRirCategory(editRow.proposedTfIncrease, editRow.proposedOsfIncrease, editRow.rir))

const form = reactive({
  regionCode: '',
  submittedByName: '',
  submittedByEmail: '',
  submittedByPosition: '',
  submittedByContact: '',
  certification: false,
  website: '',
})

const entryForm = reactive({
  proposedTfIncrease: '',
  proposedOsfIncrease: '',
  actionStatus: '',
  otherSpecifics: '',
  remarks: '',
})

const selectedRegion = computed(() => getRegionByCode(form.regionCode))
const rir = computed(() => selectedRegion.value?.rir ?? '')
const apiConfigured = computed(() => !!API_URL)
const emailIsValid = computed(() => !form.submittedByEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.submittedByEmail))
const otpEmailIsValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(otp.email))
const otpEmailAllowed = computed(() => !allowedDomain || otp.email.trim().toLowerCase().endsWith(`@${allowedDomain}`))
const actionNeedsSpecifics = computed(() => entryForm.actionStatus === REQUIRED_ACTION_WITH_SPECIFICS)
const schoolCountForRegion = computed(() => schools.value.filter((school) => school.regionCode === form.regionCode).length)
const entryModeLabel = computed(() => editingIndex.value === null ? 'Add HEI to Table' : 'Update HEI Row')
const addedHeiSummary = computed(() => {
  if (!addedEntries.value.length) return ''
  return `${addedEntries.value.length} HEI${addedEntries.value.length === 1 ? '' : 's'} ready for submission`
})

const SCHOOL_LIST_LIMIT = 100

const matchingSchools = computed(() => {
  const regionCode = form.regionCode
  if (!regionCode) return []

  const query = schoolQuery.value.trim().toLowerCase()
  const existingKeys = addedHeiKeysExcludingEdit()
  return schools.value
    .filter((school) => school.regionCode === regionCode)
    .filter((school) => !existingKeys.has(schoolKey(school)))
    .filter((school) => {
      if (!query) return true
      const haystack = [school.name, school.uii, school.province, school.cityMunicipality].join(' ').toLowerCase()
      return haystack.includes(query)
    })
})

// Render a bounded slice for performance; the notice below tells users to
// search when the full match set exceeds what is shown.
const filteredSchools = computed(() => matchingSchools.value.slice(0, SCHOOL_LIST_LIMIT))
const schoolListTruncated = computed(() => matchingSchools.value.length > filteredSchools.value.length)

const selectedSchoolSummary = computed(() => {
  if (!selectedSchool.value) return ''
  return [selectedSchool.value.name, selectedSchool.value.province, selectedSchool.value.cityMunicipality]
    .filter(Boolean)
    .join(' • ')
})

const highestIncrease = computed(() => {
  const tf = toNumberOrNull(entryForm.proposedTfIncrease)
  const osf = toNumberOrNull(entryForm.proposedOsfIncrease)
  if (tf === null && osf === null) return null
  return Math.max(tf ?? -Infinity, osf ?? -Infinity)
})

const rirCategory = computed(() => computeRirCategory(entryForm.proposedTfIncrease, entryForm.proposedOsfIncrease, rir.value))

watch(() => form.regionCode, () => {
  addedEntries.value = []
  resetEntryForm()
})

watch(() => entryForm.actionStatus, () => {
  if (!actionNeedsSpecifics.value) entryForm.otherSpecifics = ''
})

// When the verified email is lost or changed, drop any loaded management state
// so a different verifier never sees the previous email's rows.
watch(emailVerified, (value) => {
  if (!value) {
    managing.value = false
    mySubmissions.value = []
    editingRowId.value = ''
    myError.value = ''
    myMessage.value = ''
  }
})

async function loadPortalStatus() {
  if (!API_URL) return
  try {
    const data = await postJson({ action: 'getFormOptions' })
    if (typeof data.portalOpen === 'boolean') portalOpen.value = data.portalOpen
  } catch (err) {
    // Do not block data entry just because the status probe failed; submission will still validate server-side.
  }
}

async function loadSchoolsFromCsv() {
  loadingSchools.value = true
  schoolLoadError.value = ''
  try {
    const response = await fetch('/hei-list.csv', { cache: 'no-store' })
    if (!response.ok) throw new Error('Unable to load HEI CSV file.')
    const rows = parseCsv(await response.text())
    schools.value = rows
      .map((row) => ({
        name: String(row['HEI Name'] || '').trim(),
        uii: String(row.UII || '').trim(),
        regionCode: normalizeRegionCode(row.Region),
        heiType: String(row['HEI Type'] || '').trim(),
        province: String(row.Province || '').trim(),
        cityMunicipality: String(row['City/Municipality'] || '').trim(),
        status: String(row.Status || '').trim(),
      }))
      .filter((row) => row.name && row.regionCode && REGION_META.some((region) => region.code === row.regionCode))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch (err) {
    schoolLoadError.value = err?.message || 'Unable to load HEI CSV file.'
  } finally {
    loadingSchools.value = false
  }
}

function selectSchool(school) {
  selectedSchool.value = school
  schoolQuery.value = school?.name || ''
}

function schoolKey(school) {
  return String(school?.uii || school?.name || '').trim().toLowerCase()
}

function addedHeiKeysExcludingEdit() {
  return new Set(
    addedEntries.value
      .filter((entry, index) => index !== editingIndex.value)
      .map((entry) => schoolKey(entry.hei))
      .filter(Boolean),
  )
}

function clearMessages() {
  submitError.value = ''
  submitSuccess.value = ''
  submissionId.value = ''
}

function resetEntryForm() {
  selectedSchool.value = null
  schoolQuery.value = ''
  entryForm.proposedTfIncrease = ''
  entryForm.proposedOsfIncrease = ''
  entryForm.actionStatus = ''
  entryForm.otherSpecifics = ''
  entryForm.remarks = ''
  editingIndex.value = null
}

function resetForm() {
  const submitter = {
    name: form.submittedByName,
    email: form.submittedByEmail,
    position: form.submittedByPosition,
    contact: form.submittedByContact,
  }
  form.regionCode = ''
  form.submittedByName = ''
  form.submittedByEmail = ''
  form.submittedByPosition = ''
  form.submittedByContact = ''
  form.certification = false
  form.website = ''
  addedEntries.value = []
  resetEntryForm()
  // Keep the verified submitter identity so they can file another batch.
  if (emailVerified.value) {
    form.submittedByEmail = otp.verifiedEmail
    form.submittedByName = submitter.name
    form.submittedByPosition = submitter.position
    form.submittedByContact = submitter.contact
  }
}

function validateEntryDraft() {
  const missing = []
  if (!form.regionCode) missing.push('CHED Regional Office')
  if (!selectedSchool.value) missing.push('Higher Education Institution')
  if (toNumberOrNull(entryForm.proposedTfIncrease) === null && toNumberOrNull(entryForm.proposedOsfIncrease) === null) {
    missing.push('Proposed tuition or other school fees increase')
  }
  if (toNumberOrNull(entryForm.proposedTfIncrease) !== null && toNumberOrNull(entryForm.proposedTfIncrease) < 0) missing.push('Valid proposed tuition fee increase')
  if (toNumberOrNull(entryForm.proposedOsfIncrease) !== null && toNumberOrNull(entryForm.proposedOsfIncrease) < 0) missing.push('Valid proposed other school fees increase')
  if (!entryForm.actionStatus) missing.push('Action or status')
  if (actionNeedsSpecifics.value && !entryForm.otherSpecifics.trim()) missing.push('Specifics for Others')
  if (addedHeiKeysExcludingEdit().has(schoolKey(selectedSchool.value))) missing.push('A unique HEI')

  if (missing.length) throw new Error(`Please complete: ${missing.join(', ')}.`)
}

function makeEntryFromDraft() {
  validateEntryDraft()
  return {
    hei: { ...selectedSchool.value },
    proposedTfIncrease: toNumberOrNull(entryForm.proposedTfIncrease),
    proposedOsfIncrease: toNumberOrNull(entryForm.proposedOsfIncrease),
    rirCategory: rirCategory.value,
    actionStatus: entryForm.actionStatus,
    otherSpecifics: entryForm.otherSpecifics,
    remarks: entryForm.remarks,
  }
}

function addOrUpdateEntry() {
  clearMessages()
  try {
    const entry = makeEntryFromDraft()
    if (editingIndex.value === null) addedEntries.value.push(entry)
    else addedEntries.value.splice(editingIndex.value, 1, entry)
    resetEntryForm()
  } catch (err) {
    submitError.value = err?.message || 'Unable to add HEI.'
  }
}

function editEntry(index) {
  const entry = addedEntries.value[index]
  if (!entry) return
  clearMessages()
  editingIndex.value = index
  selectedSchool.value = entry.hei
  schoolQuery.value = entry.hei?.name || ''
  entryForm.proposedTfIncrease = entry.proposedTfIncrease ?? ''
  entryForm.proposedOsfIncrease = entry.proposedOsfIncrease ?? ''
  entryForm.actionStatus = entry.actionStatus || ''
  entryForm.otherSpecifics = entry.otherSpecifics || ''
  entryForm.remarks = entry.remarks || ''
}

function removeEntry(index) {
  clearMessages()
  addedEntries.value.splice(index, 1)
  if (editingIndex.value === index) resetEntryForm()
  else if (editingIndex.value !== null && editingIndex.value > index) editingIndex.value -= 1
}

function validateForm() {
  const missing = []
  if (!emailVerified.value) missing.push('Email verification')
  if (!form.regionCode) missing.push('CHED Regional Office')
  if (!addedEntries.value.length) missing.push('At least one added HEI')
  if (!form.submittedByName.trim()) missing.push('Submitted by')
  if (!form.submittedByEmail.trim()) missing.push('Official email address')
  if (!emailIsValid.value) missing.push('Valid official email address')
  if (!form.certification) missing.push('Certification')

  if (missing.length) throw new Error(`Please complete: ${missing.join(', ')}.`)
}

function resetOtpMessages() {
  otp.error = ''
  otp.message = ''
}

async function requestEmailOtp() {
  resetOtpMessages()
  if (!otpEmailIsValid.value) {
    otp.error = 'Enter a valid official email address.'
    return
  }
  if (!otpEmailAllowed.value) {
    otp.error = `Use your @${allowedDomain} email address.`
    return
  }

  try {
    otp.sending = true
    const data = await postJson({ action: 'requestEmailOtp', email: otp.email })
    otp.requestId = data.otpRequestId || ''
    otp.code = ''
    otp.sessionToken = ''
    otp.verifiedEmail = ''
    form.submittedByEmail = ''
    otp.message = data.message || 'Verification code sent.'
  } catch (err) {
    otp.error = err?.message || 'Unable to send verification code.'
  } finally {
    otp.sending = false
  }
}

async function verifyEmailOtp() {
  resetOtpMessages()
  if (!otp.requestId) {
    otp.error = 'Request a verification code first.'
    return
  }
  if (!otp.code.trim()) {
    otp.error = 'Enter the verification code sent to your email.'
    return
  }

  try {
    otp.verifying = true
    const data = await postJson({
      action: 'verifyEmailOtp',
      otpRequestId: otp.requestId,
      otpCode: otp.code,
    })
    otp.sessionToken = data.otpSessionToken || ''
    otp.verifiedEmail = data.email || otp.email
    form.submittedByEmail = otp.verifiedEmail
    otp.email = otp.verifiedEmail
    otp.message = data.message || 'Email verified.'
  } catch (err) {
    otp.error = err?.message || 'Unable to verify code.'
  } finally {
    otp.verifying = false
  }
}

function changeVerifiedEmail() {
  resetOtpMessages()
  otp.code = ''
  otp.requestId = ''
  otp.sessionToken = ''
  otp.verifiedEmail = ''
  form.submittedByEmail = ''
}

function formatPercent(value) {
  return value === null || value === undefined || value === '' ? '-' : `${value}%`
}

async function submitForm() {
  clearMessages()

  try {
    validateForm()
    submitting.value = true

    const payload = {
      action: 'submitTosf',
      submitToken: SUBMIT_TOKEN,
      otpSessionToken: otp.sessionToken,
      regionCode: form.regionCode,
      regionLabel: selectedRegion.value?.label || '',
      rir: rir.value,
      entries: addedEntries.value.map((entry) => ({
        hei: entry.hei,
        proposedTfIncrease: entry.proposedTfIncrease,
        proposedOsfIncrease: entry.proposedOsfIncrease,
        rirCategory: entry.rirCategory,
        actionStatus: entry.actionStatus,
        otherSpecifics: entry.otherSpecifics,
        remarks: entry.remarks,
      })),
      submittedByName: form.submittedByName,
      submittedByEmail: form.submittedByEmail,
      submittedByPosition: form.submittedByPosition,
      submittedByContact: form.submittedByContact,
      website: form.website,
      userAgent: navigator.userAgent,
      clientOrigin: window.location.origin,
    }

    const data = await postJson(payload)
    submissionId.value = Array.isArray(data.submissionIds) ? data.submissionIds.join(', ') : (data.submissionId || '')
    submitSuccess.value = data.message || 'TOSF monitoring submission recorded.'
    resetForm()
  } catch (err) {
    submitError.value = err?.message || 'Submission failed.'
  } finally {
    submitting.value = false
  }
}

async function loadMySubmissions() {
  if (!emailVerified.value) return
  myError.value = ''
  myMessage.value = ''
  try {
    myLoading.value = true
    const data = await postJson({ action: 'listMySubmissions', otpSessionToken: otp.sessionToken })
    mySubmissions.value = Array.isArray(data.rows) ? data.rows : []
  } catch (err) {
    myError.value = err?.message || 'Unable to load your submissions.'
  } finally {
    myLoading.value = false
  }
}

function openManage() {
  managing.value = true
  loadMySubmissions()
}

function closeManage() {
  managing.value = false
  editingRowId.value = ''
}

function startEditRow(row) {
  myError.value = ''
  myMessage.value = ''
  editingRowId.value = row.submissionId
  editRow.submissionId = row.submissionId
  editRow.heiName = row.heiName
  editRow.regionLabel = row.regionLabel
  editRow.rir = row.rir
  editRow.proposedTfIncrease = row.proposedTfIncrease ?? ''
  editRow.proposedOsfIncrease = row.proposedOsfIncrease ?? ''
  editRow.actionStatus = row.actionStatus || ''
  editRow.otherSpecifics = row.otherSpecifics || ''
  editRow.remarks = row.remarks || ''
}

function cancelEditRow() {
  editingRowId.value = ''
}

async function saveEditRow() {
  myError.value = ''
  myMessage.value = ''
  try {
    myLoading.value = true
    const data = await postJson({
      action: 'updateMySubmission',
      otpSessionToken: otp.sessionToken,
      submissionId: editRow.submissionId,
      proposedTfIncrease: editRow.proposedTfIncrease,
      proposedOsfIncrease: editRow.proposedOsfIncrease,
      actionStatus: editRow.actionStatus,
      otherSpecifics: editRow.otherSpecifics,
      remarks: editRow.remarks,
    })
    editingRowId.value = ''
    await loadMySubmissions()
    myMessage.value = data.message || 'Submission updated.'
  } catch (err) {
    myError.value = err?.message || 'Unable to update submission.'
  } finally {
    myLoading.value = false
  }
}

async function voidRow(row) {
  if (typeof window !== 'undefined' && !window.confirm(`Delete your submission for ${row.heiName}? This removes it from the consolidated report.`)) return
  myError.value = ''
  myMessage.value = ''
  try {
    myLoading.value = true
    const data = await postJson({ action: 'voidMySubmission', otpSessionToken: otp.sessionToken, submissionId: row.submissionId })
    if (editingRowId.value === row.submissionId) editingRowId.value = ''
    await loadMySubmissions()
    myMessage.value = data.message || 'Submission deleted.'
  } catch (err) {
    myError.value = err?.message || 'Unable to delete submission.'
  } finally {
    myLoading.value = false
  }
}

onMounted(() => {
  loadSchoolsFromCsv()
  loadPortalStatus()
})
</script>

<template>
  <section class="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
    <form class="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/70 sm:p-7" @submit.prevent="submitForm">
      <div class="flex flex-col gap-3 border-b border-slate-200 pb-5 md:flex-row md:items-start md:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">CHEDRO Entry Form</p>
          <h2 class="mt-2 text-2xl font-bold text-slate-950">TOSF Increase Monitoring</h2>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Add one or more HEIs from the uploaded CSV masterlist, review them in the table, then submit the batch. The RIR category is computed automatically from the applicable regional inflation rate.
          </p>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <p class="font-semibold text-slate-900">Deadline</p>
          <p>6 July 2026</p>
        </div>
      </div>

      <div v-if="!portalOpen" class="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        The submission portal is currently closed by the administrator.
      </div>
      <div v-if="!apiConfigured" class="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Backend URL is not configured. Add <strong>VITE_GAS_WEB_APP_URL</strong> in the environment file before deployment.
      </div>
      <div v-if="schoolLoadError" class="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        {{ schoolLoadError }} Put <strong>hei-list.csv</strong> in the public folder before building.
      </div>
      <div v-if="submitError" class="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{{ submitError }}</div>
      <div v-if="submitSuccess" class="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <p class="font-semibold">{{ submitSuccess }}</p>
        <p v-if="submissionId" class="mt-1 font-mono text-xs">Reference No.: {{ submissionId }}</p>
      </div>

      <div class="mt-6 grid grid-cols-1 gap-5">
        <div class="flex items-center gap-3">
          <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-black text-white">1</span>
          <h3 class="text-base font-bold text-slate-950">Select CHED Regional Office</h3>
        </div>
        <div class="grid gap-5 md:grid-cols-2">
          <label class="block">
            <span class="text-sm font-semibold text-slate-800">CHED Regional Office <span class="text-rose-600">*</span></span>
            <select v-model="form.regionCode" class="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900">
              <option value="">Select region</option>
              <option v-for="region in REGION_META" :key="region.code" :value="region.code">{{ region.label }}</option>
            </select>
          </label>

          <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p class="text-sm font-semibold text-slate-800">Applicable RIR</p>
            <p class="mt-1 text-3xl font-black text-slate-950">{{ rir === '' ? '—' : `${rir}%` }}</p>
            <p class="mt-1 text-xs text-slate-500">Private HEIs in region: {{ selectedRegion?.privateHeiCount ?? '—' }}</p>
          </div>
        </div>

        <div class="rounded-[1.5rem] border border-slate-200 p-4">
          <div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div class="flex items-start gap-3">
              <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-black text-white">2</span>
              <div>
                <label class="text-sm font-semibold text-slate-800">Higher Education Institution <span class="text-rose-600">*</span></label>
                <p class="mt-1 text-xs text-slate-500">Loaded from CSV. Search by school name, UII, province, or city.</p>
              </div>
            </div>
            <p class="text-xs text-slate-500">{{ loadingSchools ? 'Loading CSV…' : `${schoolCountForRegion} schools available` }}</p>
          </div>

          <input
            v-model="schoolQuery"
            type="search"
            :disabled="!form.regionCode || loadingSchools"
            placeholder="Select a region first, then search school name"
            class="mt-3 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100"
          />

          <div v-if="selectedSchool" class="mt-3 flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p class="font-semibold">Selected: {{ selectedSchool.name }}</p>
              <p class="mt-1 text-xs">UII {{ selectedSchool.uii || '—' }} • {{ selectedSchool.province || '—' }} • {{ selectedSchool.cityMunicipality || '—' }}</p>
            </div>
            <button type="button" class="self-start rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs font-bold text-emerald-900 transition hover:border-emerald-700" @click="selectedSchool = null">
              Change
            </button>
          </div>

          <div v-if="form.regionCode && !selectedSchool" class="mt-3 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white">
            <button
              v-for="school in filteredSchools"
              :key="`${school.uii}-${school.name}`"
              type="button"
              class="block w-full border-b border-slate-100 px-4 py-3 text-left text-sm transition last:border-b-0 hover:bg-slate-50"
              @click="selectSchool(school)"
            >
              <span class="font-semibold text-slate-900">{{ school.name }}</span>
              <span class="mt-1 block text-xs text-slate-500">UII {{ school.uii || '—' }} • {{ school.province || '—' }} • {{ school.cityMunicipality || '—' }}</span>
            </button>
            <div v-if="!filteredSchools.length" class="px-4 py-8 text-center">
              <p class="text-sm font-semibold text-slate-600">No matching HEI</p>
              <p class="mt-1 text-xs text-slate-400">{{ schoolQuery.trim() ? 'Try a different name, UII, province, or city.' : 'No HEIs are listed for this region in the CSV.' }}</p>
            </div>
            <p v-else-if="schoolListTruncated" class="sticky bottom-0 border-t border-slate-100 bg-slate-50/95 px-4 py-2 text-center text-xs text-slate-500 backdrop-blur">
              Showing first {{ filteredSchools.length }} of {{ matchingSchools.length }} HEIs. Type to narrow your search.
            </p>
          </div>
        </div>

        <div class="flex flex-col gap-1 border-t border-slate-200 pt-5 sm:flex-row sm:items-end sm:justify-between">
          <div class="flex items-start gap-3">
            <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-black text-white">3</span>
            <div>
              <h3 class="text-base font-bold text-slate-950">HEI Entry Details</h3>
              <p class="mt-1 text-xs text-slate-500">Complete the fields for the selected HEI, then add it to the table.</p>
            </div>
          </div>
          <p v-if="editingIndex !== null" class="text-xs font-semibold text-amber-700">Editing row {{ editingIndex + 1 }}</p>
        </div>

        <div class="grid gap-5 md:grid-cols-3">
          <label class="block">
            <span class="text-sm font-semibold text-slate-800">Proposed TF Increase (%)</span>
            <input v-model="entryForm.proposedTfIncrease" type="number" min="0" step="0.01" class="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900" placeholder="e.g. 4.25" />
          </label>
          <label class="block">
            <span class="text-sm font-semibold text-slate-800">Proposed OSF Increase (%)</span>
            <input v-model="entryForm.proposedOsfIncrease" type="number" min="0" step="0.01" class="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900" placeholder="e.g. 3.00" />
          </label>
          <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p class="text-sm font-semibold text-slate-800">Computed RIR Category</p>
            <p class="mt-2 text-base font-black" :class="rirCategory === 'Higher than the RIR' ? 'text-rose-700' : 'text-slate-950'">{{ rirCategory || '—' }}</p>
            <p v-if="highestIncrease !== null" class="mt-1 text-xs text-slate-500">Highest proposed increase: {{ highestIncrease }}%</p>
          </div>
        </div>

        <div v-if="rirCategory === 'Higher than the RIR'" class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          This proposal is above the applicable RIR. The CEB directive says CHEDROs shall encourage the institution to voluntarily reconsider reducing the proposed rates within the RIR or lower, whichever is feasible.
        </div>

        <div class="grid gap-5 md:grid-cols-2">
          <label class="block">
            <span class="text-sm font-semibold text-slate-800">Action or Status <span class="text-rose-600">*</span></span>
            <select v-model="entryForm.actionStatus" class="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900">
              <option value="">Select action/status</option>
              <option v-for="status in ACTION_STATUS_OPTIONS" :key="status" :value="status">{{ status }}</option>
            </select>
          </label>
          <label class="block">
            <span class="text-sm font-semibold text-slate-800">Specifics if Others <span v-if="actionNeedsSpecifics" class="text-rose-600">*</span></span>
            <input v-model="entryForm.otherSpecifics" :disabled="!actionNeedsSpecifics" type="text" class="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100" placeholder="State the specific status" />
          </label>
        </div>

        <label class="block">
          <span class="text-sm font-semibold text-slate-800">Remarks / CHEDRO Notes</span>
          <textarea v-model="entryForm.remarks" rows="3" class="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900" placeholder="Optional notes, e.g., discussion outcome, pending documents, reconsideration result"></textarea>
        </label>

        <div class="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            class="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-700 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 transition hover:from-indigo-500 hover:to-indigo-600 hover:shadow-indigo-600/40 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:active:scale-100"
            :disabled="!form.regionCode || loadingSchools"
            @click="addOrUpdateEntry"
          >
            <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path v-if="editingIndex === null" fill-rule="evenodd" d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1Z" clip-rule="evenodd" />
              <path v-else fill-rule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 0 1 1.4-1.4l3.1 3.1 6.8-6.8a1 1 0 0 1 1.4 0Z" clip-rule="evenodd" />
            </svg>
            {{ entryModeLabel }}
          </button>
          <button v-if="editingIndex !== null" type="button" class="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2" @click="resetEntryForm">
            Cancel Edit
          </button>
        </div>

        <div class="rounded-[1.5rem] border border-slate-200 p-4">
          <div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 class="text-base font-bold text-slate-950">Added HEIs</h3>
              <p class="mt-1 text-xs text-slate-500">Review added entries before submitting.</p>
            </div>
            <p class="text-xs font-semibold text-slate-600">{{ addedHeiSummary || 'No HEIs added yet' }}</p>
          </div>

          <p v-if="addedEntries.length" class="mt-3 text-xs text-slate-400 sm:hidden">Swipe the table sideways to see all columns.</p>
          <div class="mt-4 w-full overflow-x-auto rounded-2xl border border-slate-200">
            <table class="w-full min-w-[1000px] divide-y divide-slate-200 text-sm">
              <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="px-3 py-3">HEI</th>
                  <th class="px-3 py-3 text-right">TF %</th>
                  <th class="px-3 py-3 text-right">OSF %</th>
                  <th class="px-3 py-3">RIR Category</th>
                  <th class="px-3 py-3">Action / Status</th>
                  <th class="px-3 py-3">Remarks</th>
                  <th class="px-3 py-3 text-right">Manage</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-if="!addedEntries.length">
                  <td colspan="7" class="px-4 py-12">
                    <div class="mx-auto flex max-w-sm flex-col items-center gap-2 text-center">
                      <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                        <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 5.25h16.5M3.75 9.75h16.5M3.75 14.25h9" />
                        </svg>
                      </span>
                      <p class="text-sm font-semibold text-slate-700">No HEIs added yet</p>
                      <p class="text-xs leading-5 text-slate-400">Select a school above, enter the proposed increase and action, then choose <span class="font-semibold text-slate-500">Add HEI to Table</span>. Added HEIs appear here for review before you submit.</p>
                    </div>
                  </td>
                </tr>
                <tr v-for="(entry, index) in addedEntries" :key="`${entry.hei.uii}-${entry.hei.name}-${index}`" class="align-top">
                  <td class="px-3 py-3 font-semibold text-slate-900">
                    {{ entry.hei.name }}
                    <p class="text-xs font-normal text-slate-500">UII {{ entry.hei.uii || '-' }} - {{ entry.hei.province || '-' }} - {{ entry.hei.cityMunicipality || '-' }}</p>
                  </td>
                  <td class="px-3 py-3 text-right">{{ formatPercent(entry.proposedTfIncrease) }}</td>
                  <td class="px-3 py-3 text-right">{{ formatPercent(entry.proposedOsfIncrease) }}</td>
                  <td class="px-3 py-3">
                    <span class="rounded-full px-2 py-1 text-xs font-bold" :class="entry.rirCategory === 'Higher than the RIR' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'">{{ entry.rirCategory }}</span>
                  </td>
                  <td class="px-3 py-3">
                    {{ entry.actionStatus }}
                    <p v-if="entry.otherSpecifics" class="text-xs text-slate-500">{{ entry.otherSpecifics }}</p>
                  </td>
                  <td class="max-w-xs whitespace-pre-wrap px-3 py-3 text-slate-600">{{ entry.remarks || '-' }}</td>
                  <td class="px-3 py-3">
                    <div class="flex justify-end gap-2">
                      <button type="button" class="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-slate-900" @click="editEntry(index)">Edit</button>
                      <button type="button" class="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 transition hover:border-rose-500" @click="removeEntry(index)">Remove</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="rounded-[1.5rem] border border-slate-200 p-4">
          <h3 class="text-base font-bold text-slate-950">Submitted by</h3>
          <p class="mt-1 text-xs text-slate-500">Verify your official email address with a one-time passcode before submitting this report.</p>

          <div v-if="!emailVerified" class="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <label class="block">
                <span class="text-sm font-semibold text-slate-800">Official email <span class="text-rose-600">*</span></span>
                <input v-model="otp.email" type="email" class="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900" :placeholder="allowedDomain ? `name@${allowedDomain}` : 'name@example.com'" />
              </label>
              <button type="button" class="self-end rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300" :disabled="otp.sending || !otpEmailIsValid || !otpEmailAllowed" @click="requestEmailOtp">
                {{ otp.sending ? 'Sending...' : otp.requestId ? 'Resend Code' : 'Send Code' }}
              </button>
            </div>
            <p v-if="allowedDomain" class="mt-2 text-xs text-slate-500">Use your <strong>@{{ allowedDomain }}</strong> email address.</p>

            <div v-if="otp.requestId" class="mt-4 grid gap-3 md:grid-cols-[220px_auto]">
              <label class="block">
                <span class="text-sm font-semibold text-slate-800">Verification code</span>
                <input v-model="otp.code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" class="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm tracking-[0.3em] outline-none transition focus:border-slate-900" placeholder="000000" />
              </label>
              <button type="button" class="self-end rounded-2xl border border-indigo-200 bg-white px-5 py-3 text-sm font-bold text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60" :disabled="otp.verifying || !otp.code.trim()" @click="verifyEmailOtp">
                {{ otp.verifying ? 'Verifying...' : 'Verify Email' }}
              </button>
            </div>

            <p v-if="otp.message" class="mt-3 text-xs font-semibold text-emerald-700">{{ otp.message }}</p>
            <p v-if="otp.error" class="mt-3 text-xs font-semibold text-rose-700">{{ otp.error }}</p>
          </div>

          <div v-else class="mt-4 flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class="font-semibold">Email verified</p>
              <p class="text-xs">{{ form.submittedByEmail }}</p>
            </div>
            <button type="button" class="self-start rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs font-bold text-emerald-900 transition hover:border-emerald-700" @click="changeVerifiedEmail">Use another email</button>
          </div>

          <div class="mt-4 grid gap-5 md:grid-cols-2" :class="emailVerified ? '' : 'pointer-events-none opacity-60'">
            <label class="block">
              <span class="text-sm font-semibold text-slate-800">Name <span class="text-rose-600">*</span></span>
              <input v-model="form.submittedByName" type="text" :disabled="!emailVerified" class="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900 disabled:bg-slate-100" />
            </label>
            <label class="block">
              <span class="text-sm font-semibold text-slate-800">Official email <span class="text-rose-600">*</span></span>
              <input :value="form.submittedByEmail" type="email" readonly class="mt-2 w-full cursor-not-allowed rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-600 outline-none" placeholder="Verify email first" />
              <span class="mt-1 block text-xs text-slate-400">Taken from your verified OTP email and cannot be edited.</span>
            </label>
            <label class="block">
              <span class="text-sm font-semibold text-slate-800">Position / Unit</span>
              <input v-model="form.submittedByPosition" type="text" :disabled="!emailVerified" class="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900 disabled:bg-slate-100" />
            </label>
            <label class="block">
              <span class="text-sm font-semibold text-slate-800">Contact number</span>
              <input v-model="form.submittedByContact" type="text" :disabled="!emailVerified" class="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900 disabled:bg-slate-100" />
            </label>
          </div>
        </div>

        <label class="hidden">
          Website
          <input v-model="form.website" tabindex="-1" autocomplete="off" />
        </label>

        <label class="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
          <input v-model="form.certification" type="checkbox" class="mt-1 h-4 w-4 rounded border-slate-300" />
          <span>I certify that the encoded data are based on the CHEDRO's monitoring/evaluation records for TOSF applications for AY 2026-2027.</span>
        </label>

        <div class="mt-1 border-t border-slate-200 pt-5">
          <button type="submit" :disabled="submitting || !portalOpen || loadingSchools || !addedEntries.length || !emailVerified" class="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-700 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 transition hover:from-indigo-500 hover:to-indigo-600 hover:shadow-indigo-600/40 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:active:scale-100">
            <svg v-if="submitting" class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4Z" />
            </svg>
            <svg v-else class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M3.4 2.6a1 1 0 0 0-1.3 1.2l1.9 5.7a1 1 0 0 0 .8.66l7.7 1.04a.4.4 0 0 1 0 .8l-7.7 1.04a1 1 0 0 0-.8.66l-1.9 5.7a1 1 0 0 0 1.3 1.2l15-7a1 1 0 0 0 0-1.8l-15-7Z" />
            </svg>
            {{ submitting ? 'Submitting…' : addedEntries.length > 1 ? `Submit ${addedEntries.length} TOSF Monitoring Entries` : 'Submit TOSF Monitoring Entry' }}
          </button>
          <p v-if="!submitting && !emailVerified" class="mt-2 text-center text-xs text-slate-400">Verify your official email above to enable submission.</p>
          <p v-else-if="!submitting && !addedEntries.length" class="mt-2 text-center text-xs text-slate-400">Add at least one HEI to the table above to enable submission.</p>
          <p v-else-if="!submitting && !portalOpen" class="mt-2 text-center text-xs text-amber-600">The portal is currently closed by the administrator.</p>
        </div>

        <div class="rounded-[1.5rem] border border-slate-200 p-4">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 class="text-base font-bold text-slate-950">Manage previous submissions</h3>
              <p class="mt-1 text-xs text-slate-500">Edit or delete entries you filed with your verified email.</p>
            </div>
            <div class="flex gap-2">
              <button v-if="emailVerified && !managing" type="button" class="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50" @click="openManage">View my submissions</button>
              <button v-else-if="managing" type="button" class="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50" :disabled="myLoading" @click="loadMySubmissions">{{ myLoading ? 'Loading…' : 'Refresh' }}</button>
            </div>
          </div>

          <p v-if="!emailVerified" class="mt-3 text-sm text-slate-500">Verify your email in the <strong>Submitted by</strong> section above to view and manage your previous submissions.</p>

          <template v-else-if="managing">
            <div v-if="myError" class="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{{ myError }}</div>
            <div v-if="myMessage" class="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{{ myMessage }}</div>

            <p v-if="myLoading && !mySubmissions.length" class="mt-4 text-sm text-slate-500">Loading your submissions…</p>
            <p v-else-if="!mySubmissions.length" class="mt-4 text-sm text-slate-500">No active submissions found for {{ otp.verifiedEmail }}.</p>

            <div v-else class="mt-4 space-y-3">
              <div v-for="row in mySubmissions" :key="row.submissionId" class="rounded-2xl border border-slate-200 p-4">
                <template v-if="editingRowId !== row.submissionId">
                  <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div class="min-w-0">
                      <p class="font-semibold text-slate-900">{{ row.heiName }}</p>
                      <p class="text-xs text-slate-500">{{ row.regionLabel }} • {{ row.timestamp }} • Ref {{ row.submissionId }}</p>
                      <p class="mt-1 text-sm text-slate-700">TF {{ formatPercent(row.proposedTfIncrease) }} • OSF {{ formatPercent(row.proposedOsfIncrease) }} • <span :class="row.rirCategory === 'Higher than the RIR' ? 'font-semibold text-rose-700' : ''">{{ row.rirCategory }}</span></p>
                      <p class="text-sm text-slate-700">{{ row.actionStatus }}<span v-if="row.otherSpecifics" class="text-slate-500"> — {{ row.otherSpecifics }}</span></p>
                      <p v-if="row.remarks" class="mt-1 whitespace-pre-wrap text-xs text-slate-500">{{ row.remarks }}</p>
                    </div>
                    <div class="flex shrink-0 gap-2">
                      <button type="button" class="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-slate-900 disabled:opacity-50" :disabled="myLoading" @click="startEditRow(row)">Edit</button>
                      <button type="button" class="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 transition hover:border-rose-500 disabled:opacity-50" :disabled="myLoading" @click="voidRow(row)">Delete</button>
                    </div>
                  </div>
                </template>

                <template v-else>
                  <p class="font-semibold text-slate-900">{{ editRow.heiName }}</p>
                  <p class="text-xs text-slate-500">{{ editRow.regionLabel }} • Applicable RIR {{ editRow.rir }}%</p>
                  <div class="mt-3 grid gap-3 md:grid-cols-3">
                    <label class="block">
                      <span class="text-xs font-semibold text-slate-700">Proposed TF Increase (%)</span>
                      <input v-model="editRow.proposedTfIncrease" type="number" min="0" step="0.01" class="mt-1 w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-900" @keydown.enter.prevent="saveEditRow" />
                    </label>
                    <label class="block">
                      <span class="text-xs font-semibold text-slate-700">Proposed OSF Increase (%)</span>
                      <input v-model="editRow.proposedOsfIncrease" type="number" min="0" step="0.01" class="mt-1 w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-900" @keydown.enter.prevent="saveEditRow" />
                    </label>
                    <div class="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p class="text-xs font-semibold text-slate-700">Computed RIR Category</p>
                      <p class="text-sm font-bold" :class="editRowCategory === 'Higher than the RIR' ? 'text-rose-700' : 'text-slate-950'">{{ editRowCategory || '—' }}</p>
                    </div>
                  </div>
                  <div class="mt-3 grid gap-3 md:grid-cols-2">
                    <label class="block">
                      <span class="text-xs font-semibold text-slate-700">Action / Status</span>
                      <select v-model="editRow.actionStatus" class="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-900">
                        <option value="">Select action/status</option>
                        <option v-for="status in ACTION_STATUS_OPTIONS" :key="status" :value="status">{{ status }}</option>
                      </select>
                    </label>
                    <label class="block">
                      <span class="text-xs font-semibold text-slate-700">Specifics if Others</span>
                      <input v-model="editRow.otherSpecifics" :disabled="!editRowNeedsSpecifics" type="text" class="mt-1 w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100" @keydown.enter.prevent="saveEditRow" />
                    </label>
                  </div>
                  <label class="mt-3 block">
                    <span class="text-xs font-semibold text-slate-700">Remarks / CHEDRO Notes</span>
                    <textarea v-model="editRow.remarks" rows="2" class="mt-1 w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-900"></textarea>
                  </label>
                  <div class="mt-3 flex gap-2">
                    <button type="button" class="rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-700 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 transition hover:from-indigo-500 hover:to-indigo-600 disabled:cursor-not-allowed disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none" :disabled="myLoading" @click="saveEditRow">{{ myLoading ? 'Saving…' : 'Save changes' }}</button>
                    <button type="button" class="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-slate-400" :disabled="myLoading" @click="cancelEditRow">Cancel</button>
                  </div>
                </template>
              </div>
            </div>

            <button type="button" class="mt-4 text-xs font-semibold text-slate-500 underline transition hover:text-slate-800" @click="closeManage">Close</button>
          </template>
        </div>
      </div>
    </form>

    <aside class="space-y-5">
      <div class="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/70">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">CEB Guidance</p>
        <div class="mt-3 space-y-3 text-sm leading-6 text-slate-700">
          <p>Evaluation of TOSF applications continues under existing policies and guidelines.</p>
          <p>For increases above the applicable RIR, CHEDROs should encourage voluntary reconsideration within the RIR or lower where feasible.</p>
          <p>The appeal to defer implementation to AY 2027-2028 is voluntary and refers only to implementation timing.</p>
        </div>
      </div>

      <div class="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/70">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Current Selection</p>
        <dl class="mt-4 space-y-3 text-sm">
          <div>
            <dt class="font-semibold text-slate-900">Region</dt>
            <dd class="text-slate-600">{{ selectedRegion?.label || '—' }}</dd>
          </div>
          <div>
            <dt class="font-semibold text-slate-900">Draft HEI</dt>
            <dd class="text-slate-600">{{ selectedSchoolSummary || '—' }}</dd>
          </div>
          <div>
            <dt class="font-semibold text-slate-900">Added HEIs</dt>
            <dd class="text-slate-600">{{ addedHeiSummary || '—' }}</dd>
          </div>
          <div>
            <dt class="font-semibold text-slate-900">RIR category</dt>
            <dd class="text-slate-600">{{ rirCategory || '—' }}</dd>
          </div>
        </dl>
      </div>
    </aside>
  </section>
</template>

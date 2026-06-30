<template>
  <main class="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-200 px-3 py-6 sm:px-6 sm:py-10">
    <div class="mx-auto w-full max-w-[1600px]">
      <header class="mb-6 rounded-[2rem] border border-slate-200 bg-white/95 p-5 shadow-xl shadow-slate-200/70 sm:p-7">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-sm">Commission on Higher Education</p>
          <h1 class="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-4xl">TOSF Increase Monitoring Portal</h1>
          <p class="mt-3 max-w-5xl text-sm leading-6 text-slate-600">
            Consolidated CHED Regional Office reporting for Tuition Fee and Other School Fees increase applications for AY 2026-2027 pursuant to CEB Resolution No. 393-2026.
          </p>
        </div>
      </header>

      <router-view v-slot="{ Component }">
        <Suspense>
          <component :is="Component" />
          <template #fallback>
            <div class="mx-auto w-full max-w-5xl rounded-[1.5rem] border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-xl shadow-slate-200/60 sm:rounded-[2rem]">
              Loading…
            </div>
          </template>
        </Suspense>
      </router-view>
    </div>
  </main>
</template>

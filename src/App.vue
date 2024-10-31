<script setup lang="ts">
import { RouterView } from 'vue-router';
import TheNavbar from '@/components/TheNavbar.vue';
</script>

<template>
  <div class="min-h-screen bg-primaryBlack">
    <TheNavbar />
    <div class="container mx-auto max-w-7xl">
      <RouterView />
    </div>
    <br v-for="i in 85" />
  </div>
</template>

// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/', // замените <repo> на имя вашего репозитория; если деплоите на username.github.io, можно оставить '/'
  plugins: [react()]
})

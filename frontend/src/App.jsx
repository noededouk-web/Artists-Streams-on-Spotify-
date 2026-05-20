import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Artist from './pages/Artist'
import Compare from './pages/Compare'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/artist/:name" element={<Artist />} />
      <Route path="/compare" element={<Compare />} />
    </Routes>
  )
}
import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Artist from './pages/Artist'
import Tracks from './pages/Tracks'
import Compare from './pages/Compare'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/artist/:name" element={<Artist />} />
      <Route path="/artist/:name/tracks" element={<Tracks />} />
      <Route path="/compare" element={<Compare />} />
    </Routes>
  )
}
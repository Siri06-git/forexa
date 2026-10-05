// Central API client — all calls go through Vite's proxy to http://localhost:8000
import axios from 'axios'

const api = axios.create({ baseURL: '/api', timeout: 15000 })

export const getRegions = () => api.get('/regions').then(r => r.data)

export const getCases = (region, leadTime) => {
  const params = {}
  if (region) params.region = region
  if (leadTime) params.lead_time = leadTime
  return api.get('/cases', { params }).then(r => r.data)
}

export const getCase = (id) => api.get(`/cases/${id}`).then(r => r.data)

export const getOverview = (leadTime) =>
  api.get('/overview', { params: { lead_time: leadTime } }).then(r => r.data)

export const analyzeCase = (region, forecastDate, leadTime) =>
  api.post('/analyze', { region, forecast_date: forecastDate, lead_time: leadTime }).then(r => r.data)

export const getVerification = () => api.get('/verification').then(r => r.data)

export const getDemoHighRisk = () => api.get('/demo/high-risk').then(r => r.data)
export const getDemoLowRisk = () => api.get('/demo/low-risk').then(r => r.data)

export const getGeoJSON = () => api.get('/geojson').then(r => r.data)

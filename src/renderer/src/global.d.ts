import type { StockFacilApi } from '../../shared/contracts'

declare global {
  interface Window {
    stockFacil: StockFacilApi
  }
}
export {}

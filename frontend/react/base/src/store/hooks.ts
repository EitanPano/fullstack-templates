import { useDispatch, useSelector } from 'react-redux'

import type { AppDispatch, RootState } from '@/store'

// The typed hooks a component uses; a plain useDispatch would not know the thunk and API types.
export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()

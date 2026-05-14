import { configureStore } from '@reduxjs/toolkit';
import authReducer   from './slices/authSlice';
import splitsReducer from './slices/splitsSlice';

export const store = configureStore({
  reducer: {
    auth:   authReducer,
    splits: splitsReducer,
  },
});

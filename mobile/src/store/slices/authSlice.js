import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI } from '../../services/api';

// ─────────────────────────────────────────
// ASYNC THUNKS
// ─────────────────────────────────────────
export const registerUser = createAsyncThunk(
  'auth/register',
  async (data, { rejectWithValue }) => {
    try {
      const res = await authAPI.register(data);
      await AsyncStorage.setItem('token', res.data.token);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || 'Registration failed');
    }
  }
);

export const loginUser = createAsyncThunk(
  'auth/login',
  async (data, { rejectWithValue }) => {
    try {
      const res = await authAPI.login(data);
      await AsyncStorage.setItem('token', res.data.token);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || 'Login failed');
    }
  }
);

export const loadUser = createAsyncThunk(
  'auth/loadUser',
  async (_, { rejectWithValue }) => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return rejectWithValue('No token');
      const res = await authAPI.me();
      return { user: res.data.user, token };
    } catch (err) {
      return rejectWithValue('Session expired');
    }
  }
);

export const logoutUser = createAsyncThunk('auth/logout', async () => {
  await AsyncStorage.removeItem('token');
  await authAPI.logout().catch(() => {});
});

// ─────────────────────────────────────────
// SLICE
// ─────────────────────────────────────────
const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user:    null,
    token:   null,
    loading: false,
    error:   null,
  },
  reducers: {
    clearError: (state) => { state.error = null; },
  },
  extraReducers: (builder) => {
    const pending   = (state) => { state.loading = true; state.error = null; };
    const rejected  = (state, action) => { state.loading = false; state.error = action.payload; };

    builder
      .addCase(registerUser.pending,  pending)
      .addCase(registerUser.fulfilled, (state, action) => {
        state.loading = false;
        state.user    = action.payload.user;
        state.token   = action.payload.token;
      })
      .addCase(registerUser.rejected, rejected)

      .addCase(loginUser.pending,  pending)
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;
        state.user    = action.payload.user;
        state.token   = action.payload.token;
      })
      .addCase(loginUser.rejected, rejected)

      .addCase(loadUser.pending,  pending)
      .addCase(loadUser.fulfilled, (state, action) => {
        state.loading = false;
        state.user    = action.payload.user;
        state.token   = action.payload.token;
      })
      .addCase(loadUser.rejected, (state) => {
        state.loading = false;
        state.user    = null;
        state.token   = null;
      })

      .addCase(logoutUser.fulfilled, (state) => {
        state.user  = null;
        state.token = null;
      });
  },
});

export const { clearError } = authSlice.actions;
export default authSlice.reducer;

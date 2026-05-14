import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { splitsAPI } from '../../services/api';

export const fetchPendingSplits = createAsyncThunk(
  'splits/fetchPending',
  async (_, { rejectWithValue }) => {
    try {
      const res = await splitsAPI.getPending();
      return res.data.splits;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || 'Failed to load splits');
    }
  }
);

export const acceptSplit = createAsyncThunk(
  'splits/accept',
  async (splitId, { rejectWithValue }) => {
    try {
      await splitsAPI.accept(splitId);
      return splitId;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || 'Failed to accept');
    }
  }
);

export const payLaterSplit = createAsyncThunk(
  'splits/payLater',
  async ({ splitId, due_date }, { rejectWithValue }) => {
    try {
      await splitsAPI.payLater(splitId, due_date);
      return splitId;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || 'Failed to set pay later');
    }
  }
);

export const declineSplit = createAsyncThunk(
  'splits/decline',
  async ({ splitId, reason }, { rejectWithValue }) => {
    try {
      await splitsAPI.decline(splitId, reason);
      return splitId;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || 'Failed to decline');
    }
  }
);

const splitsSlice = createSlice({
  name: 'splits',
  initialState: {
    pending: [],
    loading: false,
    error:   null,
  },
  reducers: {
    addIncomingSplit: (state, action) => {
      // Called by WebSocket when a new split arrives live
      state.pending.unshift(action.payload);
    },
    removeSplit: (state, action) => {
      state.pending = state.pending.filter(s => s.id !== action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPendingSplits.pending,   (state) => { state.loading = true; })
      .addCase(fetchPendingSplits.fulfilled, (state, action) => {
        state.loading = false;
        state.pending = action.payload;
      })
      .addCase(fetchPendingSplits.rejected,  (state, action) => {
        state.loading = false;
        state.error   = action.payload;
      })
      .addCase(acceptSplit.fulfilled,  (state, action) => {
        state.pending = state.pending.filter(s => s.id !== action.payload);
      })
      .addCase(payLaterSplit.fulfilled, (state, action) => {
        state.pending = state.pending.filter(s => s.id !== action.payload);
      })
      .addCase(declineSplit.fulfilled, (state, action) => {
        state.pending = state.pending.filter(s => s.id !== action.payload);
      });
  },
});

export const { addIncomingSplit, removeSplit } = splitsSlice.actions;
export default splitsSlice.reducer;

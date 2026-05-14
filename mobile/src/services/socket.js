import { io } from 'socket.io-client';
import { SOCKET_URL } from '../constants';
import { store } from '../store';
import { addIncomingSplit, removeSplit } from '../store/slices/splitsSlice';

let socket = null;

export const connectSocket = (token) => {
  if (socket?.connected) return;

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket'],
  });

  socket.on('connect', () => {
    console.log('🔌 WebSocket connected');
  });

  socket.on('disconnect', () => {
    console.log('🔌 WebSocket disconnected');
  });

  // ─────────────────────────────────────────
  // INCOMING EVENTS → update Redux store live
  // ─────────────────────────────────────────

  // New split request arrived (you are a payee)
  socket.on('split:request', ({ split, transaction, payer_name }) => {
    store.dispatch(addIncomingSplit({ ...split, merchant_name: transaction.merchant_name, payer_name }));
  });

  // Someone accepted your split (you are the payer)
  socket.on('split:accepted', ({ split_id, payee_name, amount }) => {
    console.log(`✅ ${payee_name} paid £${amount}`);
    // UI will show toast/alert — handled in screens
  });

  // Someone chose pay later
  socket.on('split:pay_later', ({ split_id, payee_name, amount, due_date }) => {
    console.log(`⏳ ${payee_name} will pay £${amount} by ${due_date}`);
  });

  // Someone declined
  socket.on('split:declined', ({ split_id, payee_name, amount, reason }) => {
    console.log(`❌ ${payee_name} declined £${amount}: ${reason}`);
  });
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const getSocket = () => socket;

import axios from 'axios';

const client = axios.create();

export function errorText(error, fallback) {
  return error?.response?.data?.error || error?.message || fallback;
}

export async function getHealth() {
  const { data } = await client.get('/api/health');
  return data;
}

export async function listIdentities() {
  const { data } = await client.get('/api/identities');
  return data.identities;
}

export async function getIdentity(id) {
  const { data } = await client.get(`/api/identities/${encodeURIComponent(id)}`);
  return data;
}

export async function saveIdentity(payload) {
  const { data } = await client.post('/api/identities', payload);
  return data;
}

export async function anchorTx(id, txHash) {
  const { data } = await client.post(`/api/identities/${encodeURIComponent(id)}/anchor`, { txHash });
  return data;
}

export async function getAdmin() {
  const { data } = await client.get('/api/admin');
  return data;
}

export async function adminNonce(payload) {
  const { data } = await client.post('/api/admin/nonce', payload);
  return data;
}

export async function claimAdmin(payload) {
  const { data } = await client.post('/api/admin/claim', payload);
  return data;
}

export async function verifyIdentity(id, proof) {
  const { data } = await client.post(`/api/identities/${encodeURIComponent(id)}/verify`, proof);
  return data;
}

export async function revokeIdentity(id, proof) {
  const { data } = await client.post(`/api/identities/${encodeURIComponent(id)}/revoke`, proof);
  return data;
}

export async function removeIdentity(id, proof) {
  const { data } = await client.delete(`/api/identities/${encodeURIComponent(id)}`, { data: proof });
  return data;
}

export async function uploadFile(file, onProgress) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await client.post('/api/upload', form, {
    onUploadProgress: (event) => {
      if (!onProgress || !event.total) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    },
  });
  return data;
}

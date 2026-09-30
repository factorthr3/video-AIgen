// Gameplay library: upload, list, preview and delete footage.
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../auth.js';
import { HttpError } from '../services.js';
import { isAdmin } from '../billing/index.js';
import {
  GAMEPLAY_INCOMING, addUpload, removeClip, visibleClips, visibleClip, publicClip, gamesFor, clipThumb, clipVideo,
} from '../gameplay.js';

export const MAX_UPLOAD_MB = 1024;

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.diskStorage({
    destination: GAMEPLAY_INCOMING,
    filename: (req, file, cb) => cb(null, `${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname).toLowerCase().slice(0, 6)}`),
  }),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^video\//.test(file.mimetype) || /\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(file.originalname)),
});

router.get('/', (req, res) => {
  res.json({
    clips: visibleClips(req.user).map((c) => publicClip(c, req.user)),
    games: gamesFor(req.user),
    shareUploads: isAdmin(req.user),
    maxUploadMb: MAX_UPLOAD_MB,
  });
});

router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) throw new HttpError(400, 'Choose a video file (MP4, MOV, MKV or WebM).');
  const clip = addUpload(req.user, req.file, req.body?.game);
  res.status(201).json({ clip: publicClip(clip, req.user) });
});

router.delete('/:id', (req, res) => {
  removeClip(req.user, req.params.id);
  res.json({ ok: true });
});

const readyClip = (req) => {
  const clip = visibleClip(req.user, req.params.id);
  if (!clip || clip.status !== 'ready') throw new HttpError(404, 'Clip not found.');
  return clip;
};

router.get('/:id/thumb.jpg', (req, res) => {
  const file = clipThumb(readyClip(req).id);
  if (!fs.existsSync(file)) throw new HttpError(404, 'No thumbnail.');
  res.type('image/jpeg').sendFile(file);
});

router.get('/:id/video.mp4', (req, res) => {
  res.type('video/mp4').sendFile(clipVideo(readyClip(req).id));
});

export default router;

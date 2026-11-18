import assert from "node:assert/strict";
import { goedBeeld, uniekeBeelden } from "../../src/beeld";

// Een nieuwsfoto over de film Avatar blijft; echte profielavatars en placeholders blijven geweerd (#1280).
const foto = "https://example.nl/nieuws/avatar-fire-and-ash-premiere.jpg";
assert.deepEqual(uniekeBeelden([foto]), [foto]);
assert.ok(goedBeeld("https://example.nl/2025/12/nieuwe-avatar-film-breekt-records-in-bioscoop.jpg?width=1200"));
for (const u of [
  "https://avatars.example.com/u/123/photo.jpg",
  "https://example.nl/avatars/12345.jpg",
  "https://example.nl/avatar/12345.jpg",
  "https://example.nl/uploads/avatar.jpg",
  "https://example.nl/uploads/user-avatar-1200.jpg",
  "https://example.nl/uploads/default-avatar-big-image.jpg",
  "https://example.nl/uploads/comment_avatar_large_photo.jpg",
  "https://example.nl/uploads/avatar-3.jpg",
  "https://example.nl/uploads/avatarimage.jpg",
  "https://example.nl/assets/placeholder.jpg",
]) assert.equal(goedBeeld(u), false, u);

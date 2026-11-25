var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_http = __toESM(require("http"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_crypto2 = __toESM(require("crypto"), 1);
var import_ws = require("ws");
var import_dotenv = __toESM(require("dotenv"), 1);

// src/data/geoguessrLocations.ts
function haversineDistanceKm(a, b) {
  const R = 6371;
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}
function calculateGeoScore(distanceKm, mapScaleKm) {
  const perfectThresholdKm = Math.min(0.025, Math.max(0.01, mapScaleKm * 2e-5));
  if (distanceKm <= perfectThresholdKm) return 5e3;
  const score = 5e3 * Math.exp(-10 * distanceKm / mapScaleKm);
  return Math.max(0, Math.min(5e3, Math.round(score)));
}
function getDuelMultiplier(roundNumber) {
  if (roundNumber <= 3) return 1;
  if (roundNumber === 4) return 1.5;
  if (roundNumber === 5) return 2;
  if (roundNumber === 6) return 2.5;
  return 3;
}
var JAPAN_COORDS = [
  { lat: 35.66792, lng: 139.69162, panoId: "9cb667de-032e-4e11-be6e-47e78d66538c", sdUrl: "https://panoramax.osm.tw/api/pictures/9cb667de-032e-4e11-be6e-47e78d66538c/sd.jpg", az: 234 },
  // Tokyo Shibuya
  { lat: 35.68434, lng: 139.77785, panoId: "78e8a214-b9e6-4b31-9e40-de0650b8cfbe", sdUrl: "https://panoramax.osm.tw/api/pictures/78e8a214-b9e6-4b31-9e40-de0650b8cfbe/sd.jpg", az: 274 },
  // Tokyo Asakusa / Nihonbashi
  { lat: 35.68615, lng: 139.69381, panoId: "012d3c25-ff3a-424a-a216-12a2d014b494", sdUrl: "https://panoramax.osm.tw/api/pictures/012d3c25-ff3a-424a-a216-12a2d014b494/sd.jpg", az: 50 },
  // Tokyo Shinjuku
  { lat: 35.67776, lng: 139.76495, panoId: "ff40ace8-c41b-4235-851c-4ff3516b453e", sdUrl: "https://panoramax.osm.tw/api/pictures/ff40ace8-c41b-4235-851c-4ff3516b453e/sd.jpg", az: 284 },
  // Tokyo Ginza
  { lat: 35.67765, lng: 139.42128, panoId: "5095820a-12d7-4a91-bd7f-007cf614e43e", sdUrl: "https://panoramax.osm.tw/api/pictures/5095820a-12d7-4a91-bd7f-007cf614e43e/sd.jpg", az: 245 },
  // Tachikawa
  { lat: 35.48132, lng: 139.45551, panoId: "4873014d-2da7-4f42-98f8-83e9a871c2f0", sdUrl: "https://panoramax.osm.tw/api/pictures/4873014d-2da7-4f42-98f8-83e9a871c2f0/sd.jpg", az: 112 },
  // Machida
  { lat: 35.51133, lng: 139.71373, panoId: "67880dd8-ef62-4d01-a3b4-5ae9c351d176", sdUrl: "https://panoramax.osm.tw/api/pictures/67880dd8-ef62-4d01-a3b4-5ae9c351d176/sd.jpg", az: 238 },
  // Kawasaki
  { lat: 35.44396, lng: 139.63796, panoId: "6619106a-1adf-453d-8e83-c1e483364d36", sdUrl: "https://panoramax.osm.tw/api/pictures/6619106a-1adf-453d-8e83-c1e483364d36/sd.jpg", az: 19 },
  // Yokohama
  { lat: 35.30932, lng: 139.54498, panoId: "be510d84-c150-4572-8899-dab4bbfe2a64", sdUrl: "https://panoramax.osm.tw/api/pictures/be510d84-c150-4572-8899-dab4bbfe2a64/sd.jpg", az: 282 },
  // Kamakura
  { lat: 35.31448, lng: 139.47495, panoId: "359c5253-5bcd-49ae-833d-82cb4401d61f", sdUrl: "https://panoramax.osm.tw/api/pictures/359c5253-5bcd-49ae-833d-82cb4401d61f/sd.jpg", az: 307 },
  // Fujisawa
  { lat: 35.308, lng: 139.4825, panoId: "d8482ef5-81a4-4a9c-b741-6b142653dbf4", sdUrl: "https://panoramax.osm.tw/api/pictures/d8482ef5-81a4-4a9c-b741-6b142653dbf4/sd.jpg", az: 292 },
  // Enoshima
  { lat: 35.34245, lng: 139.2035, panoId: "3609ef0c-180f-412c-81d3-2c5a34368c4a", sdUrl: "https://panoramax.osm.tw/api/pictures/3609ef0c-180f-412c-81d3-2c5a34368c4a/sd.jpg", az: 37 },
  // Odawara
  { lat: 35.63428, lng: 140.12308, panoId: "74cf8b6b-32fb-424a-a711-34517b3c3f44", sdUrl: "https://panoramax.osm.tw/api/pictures/74cf8b6b-32fb-424a-a711-34517b3c3f44/sd.jpg", az: 64 },
  // Chiba
  { lat: 36.50381, lng: 140.57713, panoId: "0d7456c8-8e82-4e2e-9b2a-97f659c5253a", sdUrl: "https://panoramax.osm.tw/api/pictures/0d7456c8-8e82-4e2e-9b2a-97f659c5253a/sd.jpg", az: 312 },
  // Mito / Hitachi
  { lat: 35.4896, lng: 138.79514, panoId: "a332b9bc-c74e-4c82-a7b7-9cf50900f1b6", sdUrl: "https://panoramax.osm.tw/api/pictures/a332b9bc-c74e-4c82-a7b7-9cf50900f1b6/sd.jpg", az: 130 },
  // Fujiyoshida / Mt. Fuji
  { lat: 35.52539, lng: 138.74499, panoId: "8a6cd3f3-cf1a-43b3-afb2-b32fbbd536ba", sdUrl: "https://panoramax.osm.tw/api/pictures/8a6cd3f3-cf1a-43b3-afb2-b32fbbd536ba/sd.jpg", az: 54 },
  // Kofu / Kawaguchiko
  { lat: 36.56174, lng: 136.65663, panoId: "c6efbd54-ea10-49df-b8b2-b86e521ba8b9", sdUrl: "https://panoramax.osm.tw/api/pictures/c6efbd54-ea10-49df-b8b2-b86e521ba8b9/sd.jpg", az: 55 },
  // Kanazawa
  { lat: 36.70204, lng: 137.21137, panoId: "464efe59-2dcc-4869-a9e9-f81ead20b550", sdUrl: "https://panoramax.osm.tw/api/pictures/464efe59-2dcc-4869-a9e9-f81ead20b550/sd.jpg", az: 190 },
  // Toyama
  { lat: 35.05164, lng: 136.89897, panoId: "9870b580-0d2d-40bf-bb07-5ca646e2387b", sdUrl: "https://panoramax.osm.tw/api/pictures/9870b580-0d2d-40bf-bb07-5ca646e2387b/sd.jpg", az: 95 },
  // Nagoya
  { lat: 35.03544, lng: 136.72908, panoId: "cc3f6839-6dab-4f49-9e10-dc977cb189ee", sdUrl: "https://panoramax.osm.tw/api/pictures/cc3f6839-6dab-4f49-9e10-dc977cb189ee/sd.jpg", az: 148 },
  // Yokkaichi
  { lat: 35.01747, lng: 135.76763, panoId: "e30d6e0e-d4ea-4941-bec6-c41d6a330eec", sdUrl: "https://panoramax.osm.tw/api/pictures/e30d6e0e-d4ea-4941-bec6-c41d6a330eec/sd.jpg", az: 268 },
  // Kyoto
  { lat: 34.89236, lng: 135.80441, panoId: "67893eb3-c8d9-427e-b357-e03ebe4f54b0", sdUrl: "https://panoramax.osm.tw/api/pictures/67893eb3-c8d9-427e-b357-e03ebe4f54b0/sd.jpg", az: 324 },
  // Uji
  { lat: 35.01701, lng: 135.8608, panoId: "f469f60b-4649-4e61-9e43-6eb8d5d17214", sdUrl: "https://panoramax.osm.tw/api/pictures/f469f60b-4649-4e61-9e43-6eb8d5d17214/sd.jpg", az: 7 },
  // Otsu
  { lat: 34.68773, lng: 135.80521, panoId: "b90e1877-340a-4f5f-a376-4a47993b479a", sdUrl: "https://panoramax.osm.tw/api/pictures/b90e1877-340a-4f5f-a376-4a47993b479a/sd.jpg", az: 90 },
  // Nara
  { lat: 34.71505, lng: 135.58819, panoId: "a1e51500-4f34-4457-ae66-16b58cb3ba35", sdUrl: "https://panoramax.osm.tw/api/pictures/a1e51500-4f34-4457-ae66-16b58cb3ba35/sd.jpg", az: 142 },
  // Osaka
  { lat: 34.52465, lng: 135.50141, panoId: "06033bc4-40e8-43be-81dc-532598bb9f28", sdUrl: "https://panoramax.osm.tw/api/pictures/06033bc4-40e8-43be-81dc-532598bb9f28/sd.jpg", az: 245 },
  // Sakai
  { lat: 34.44261, lng: 135.25127, panoId: "2fb542bc-4791-4e84-bb16-bdd10f85d603", sdUrl: "https://panoramax.osm.tw/api/pictures/2fb542bc-4791-4e84-bb16-bdd10f85d603/sd.jpg", az: 254 },
  // Kobe / Osaka Bay
  { lat: 38.24223, lng: 140.95226, panoId: "ba7193ad-ab7b-4893-9cfa-b970322deba1", sdUrl: "https://panoramax.osm.tw/api/pictures/ba7193ad-ab7b-4893-9cfa-b970322deba1/sd.jpg", az: 194 }
  // Sendai
];
var EUROPE_COORDS = [
  { lat: 48.85699, lng: 2.35201, panoId: "69fe75b5-f795-49c0-b5c7-37e58df10e3f", sdUrl: "https://panoramax.openstreetmap.fr/derivates/69/fe/75/b5/f795-49c0-b5c7-37e58df10e3f/sd.jpg", az: 265 },
  // Paris
  { lat: 45.76401, lng: 4.83577, panoId: "634598d8-a4c8-43ee-a1b3-5194ed12eea3", sdUrl: "https://panoramax-storage-public-fast.s3.gra.perf.cloud.ovh.net/derivates/63/45/98/d8/a4c8-43ee-a1b3-5194ed12eea3/sd.jpg", az: 45 },
  // Lyon
  { lat: 43.29606, lng: 5.36983, panoId: "24908aa7-76a2-47a0-9150-c300fa350cc8", sdUrl: "https://panoramax.ign.fr/api/pictures/24908aa7-76a2-47a0-9150-c300fa350cc8/sd.jpg", az: 82 },
  // Marseille
  { lat: 43.71024, lng: 7.26193, panoId: "cb7d65ad-dab5-4f5f-84f2-ac4db075f244", sdUrl: "https://panoramax.ign.fr/api/pictures/cb7d65ad-dab5-4f5f-84f2-ac4db075f244/sd.jpg", az: 74 },
  // Nice
  { lat: 44.83742, lng: -0.57917, panoId: "383c89d6-8abe-4e74-b33e-26b3f7172c56", sdUrl: "https://panoramax.ign.fr/api/pictures/383c89d6-8abe-4e74-b33e-26b3f7172c56/sd.jpg", az: 85 },
  // Bordeaux
  { lat: 43.60461, lng: 1.44371, panoId: "67bd2c6a-8530-42be-83c8-910ea19fcc6c", sdUrl: "https://panoramax.openstreetmap.fr/derivates/67/bd/2c/6a/8530-42be-83c8-910ea19fcc6c/sd.jpg", az: 352 },
  // Toulouse
  { lat: 51.5345, lng: -0.17604, panoId: "746d6095-a1bc-4966-aa6d-5f17c62a7453", sdUrl: "https://panoramax-ulm.jjbaur.de/derivatives/74/6d/60/95/a1bc-4966-aa6d-5f17c62a7453/sd.jpg", az: 254 },
  // London
  { lat: 55.90258, lng: -3.13419, panoId: "dda564e2-82f9-44f2-883f-1e049c4048f9", sdUrl: "https://panoramax.openstreetmap.fr/derivates/dd/a5/64/e2/82f9-44f2-883f-1e049c4048f9/sd.jpg", az: 11 },
  // Edinburgh
  { lat: 53.34982, lng: -6.26016, panoId: "83779d4e-dbee-4c06-897b-417ab368d2f7", sdUrl: "https://panoramax.openstreetmap.fr/derivates/83/77/9d/4e/dbee-4c06-897b-417ab368d2f7/sd.jpg", az: 244 },
  // Dublin
  { lat: 52.52114, lng: 13.41313, panoId: "ed009b56-97c5-4129-b912-876b271f2021", sdUrl: "https://panoramax.openstreetmap.fr/derivates/ed/00/9b/56/97c5-4129-b912-876b271f2021/sd.jpg", az: 108 },
  // Berlin
  { lat: 48.1385, lng: 11.57928, panoId: "de710241-3abd-43d2-aefd-7fa1e84759a2", sdUrl: "https://panoramax.openstreetmap.fr/derivates/de/71/02/41/3abd-43d2-aefd-7fa1e84759a2/sd.jpg", az: 0 },
  // Munich
  { lat: 53.55058, lng: 9.99588, panoId: "6885877f-5c19-42cc-9c46-93d2a48ba95a", sdUrl: "https://panoramax.openstreetmap.fr/derivates/68/85/87/7f/5c19-42cc-9c46-93d2a48ba95a/sd.jpg", az: 159 },
  // Hamburg
  { lat: 41.89094, lng: 12.4919, panoId: "20aae997-0c7b-4877-87cb-a42e155f2fb8", sdUrl: "https://images.panoramax.basi.re/derivates/20/aa/e9/97/0c7b-4877-87cb-a42e155f2fb8/sd.jpg", az: 0 },
  // Rome
  { lat: 45.50848, lng: 9.18973, panoId: "26078e8a-6349-49d1-90b9-23414e553324", sdUrl: "https://panoramax.openstreetmap.fr/derivates/26/07/8e/8a/6349-49d1-90b9-23414e553324/sd.jpg", az: 315 },
  // Milan
  { lat: 40.41955, lng: -3.71125, panoId: "93325738-6d39-4d9d-b121-299290b8a4cc", sdUrl: "https://panoramax.openstreetmap.es/derivatives/93/32/57/38/6d39-4d9d-b121-299290b8a4cc/sd.jpg", az: 242 },
  // Madrid
  { lat: 38.71785, lng: -9.14373, panoId: "7b817f17-3702-4513-9415-5219f7503ab8", sdUrl: "https://panoramax.openstreetmap.fr/derivates/7b/81/7f/17/3702-4513-9415-5219f7503ab8/sd.jpg", az: 163 },
  // Lisbon
  { lat: 51.86256, lng: 4.53629, panoId: "8e8b197a-fb0d-47d6-83db-297c2a33dc94", sdUrl: "https://panoramax.openstreetmap.fr/derivates/8e/8b/19/7a/fb0d-47d6-83db-297c2a33dc94/sd.jpg", az: 178 },
  // Amsterdam
  { lat: 50.8503, lng: 4.3517, panoId: "e6932471-7160-442d-a6cd-97e885e72317", sdUrl: "https://panoramax.openstreetmap.fr/derivates/e6/93/24/71/7160-442d-a6cd-97e885e72317/sd.jpg", az: 74 },
  // Brussels
  { lat: 47.3771, lng: 8.54175, panoId: "2fd5c73d-450b-4f90-b7a7-b7052bf531e5", sdUrl: "https://images.panoramax.basi.re/derivates/2f/d5/c7/3d/450b-4f90-b7a7-b7052bf531e5/sd.jpg", az: 280 },
  // Zurich
  { lat: 48.19567, lng: 16.37373, panoId: "4aaac766-c461-41f5-9c43-e75aedc34fe6", sdUrl: "https://panoramax.openstreetmap.fr/derivates/4a/aa/c7/66/c461-41f5-9c43-e75aedc34fe6/sd.jpg", az: 317 },
  // Vienna
  { lat: 50.13222, lng: 14.49839, panoId: "3e2019aa-8676-453e-a3ec-431ec966bd33", sdUrl: "https://panoramax.openstreetmap.fr/derivates/3e/20/19/aa/8676-453e-a3ec-431ec966bd33/sd.jpg", az: 133 },
  // Prague
  { lat: 45.79257, lng: 16.00403, panoId: "946ccc93-9cbe-4e4c-bf33-260a1a3cf9a5", sdUrl: "https://panoramax.osm-hr.org/derivatives/94/6c/cc/93/9cbe-4e4c-bf33-260a1a3cf9a5/sd.jpg", az: 262 },
  // Zagreb
  { lat: 59.90845, lng: 10.75042, panoId: "2620c654-47ff-485d-ad1f-a70177193198", sdUrl: "https://images.panoramax.basi.re/derivates/26/20/c6/54/47ff-485d-ad1f-a70177193198/sd.jpg", az: 236 },
  // Oslo
  { lat: 59.33384, lng: 18.0705, panoId: "acef2e95-5271-4ad6-a8c4-179f416f2760", sdUrl: "https://images.panoramax.basi.re/derivates/ac/ef/2e/95/5271-4ad6-a8c4-179f416f2760/sd.jpg", az: 127 },
  // Stockholm
  { lat: 60.18477, lng: 24.82424, panoId: "374cd5c1-ff35-4ec1-96cc-e7437a998288", sdUrl: "https://panoramax.openstreetmap.fr/derivates/37/4c/d5/c1/ff35-4ec1-96cc-e7437a998288/sd.jpg", az: 231 },
  // Helsinki
  { lat: 54.67706, lng: 25.26563, panoId: "c8fffca0-0c72-49d6-a0d0-c0b638fe7f9b", sdUrl: "https://panoramax.openstreetmap.fr/derivates/c8/ff/fc/a0/0c72-49d6-a0d0-c0b638fe7f9b/sd.jpg", az: 73 },
  // Vilnius
  { lat: 41.01131, lng: 28.97491, panoId: "3ea284f4-c0bd-4065-88e4-b9d70d438d7a", sdUrl: "https://panoramax.openstreetmap.fr/derivates/3e/a2/84/f4/c0bd-4065-88e4-b9d70d438d7a/sd.jpg", az: 40 },
  // Istanbul
  { lat: 63.92991, lng: -21.9942, panoId: "26e6516b-ba04-4e5c-967b-8a932e8e6d5e", sdUrl: "https://panoramax.ign.fr/api/pictures/26e6516b-ba04-4e5c-967b-8a932e8e6d5e/sd.jpg", az: 199 }
  // Iceland (Reykjavik area)
];
var AMERICAS_COORDS = [
  { lat: 40.77602, lng: -73.97118, panoId: "ae88e407-0679-4da5-817f-ab4e5f427ed5", sdUrl: "https://panoramax.openstreetmap.fr/derivates/ae/88/e4/07/0679-4da5-817f-ab4e5f427ed5/sd.jpg", az: 208 },
  // New York City
  { lat: 41.72764, lng: -87.81138, panoId: "54e97742-cc08-4363-9ba0-aacd7fb7c6f4", sdUrl: "https://panoramax.openstreetmap.fr/derivates/54/e9/77/42/cc08-4363-9ba0-aacd7fb7c6f4/sd.jpg", az: 142 },
  // Chicago
  { lat: 42.37322, lng: -71.08601, panoId: "083b79fd-db57-411e-8d9f-474e460c899e", sdUrl: "https://panoramax.openstreetmap.fr/derivates/08/3b/79/fd/db57-411e-8d9f-474e460c899e/sd.jpg", az: 207 },
  // Boston
  { lat: 30.26708, lng: -97.74319, panoId: "85c8dc83-68d6-4bfa-82a5-0e19ca6d0a72", sdUrl: "https://panoramax.openstreetmap.fr/derivates/85/c8/dc/83/68d6-4bfa-82a5-0e19ca6d0a72/sd.jpg", az: 103 },
  // Austin
  { lat: 32.95128, lng: -117.06764, panoId: "ba82bf8a-f2ef-4213-9014-eb52320ee345", sdUrl: "https://panoramax.mapcomplete.org/derivatives/ba/82/bf/8a/f2ef-4213-9014-eb52320ee345/sd.jpg", az: 82 },
  // San Diego area
  { lat: 39.90903, lng: -105.14816, panoId: "2efb820a-c0ce-40db-9492-e745720a2633", sdUrl: "https://panoramax-ulm.jjbaur.de/derivatives/2e/fb/82/0a/c0ce-40db-9492-e745720a2633/sd.jpg", az: 273 },
  // Denver area
  { lat: 45.52342, lng: -73.62282, panoId: "cf789ab0-3e7d-4e8c-a558-42ef71383f5e", sdUrl: "https://panoramax.openstreetmap.fr/derivates/cf/78/9a/b0/3e7d-4e8c-a558-42ef71383f5e/sd.jpg", az: -77 },
  // Montreal
  { lat: -34.62302, lng: -58.38225, panoId: "72043c78-cd89-45a9-ba6d-d6ad383f1aca", sdUrl: "https://panoramax.libre.net.ar/derivatives/72/04/3c/78/cd89-45a9-ba6d-d6ad383f1aca/sd.jpg", az: 91 },
  // Buenos Aires
  { lat: -31.42033, lng: -64.18882, panoId: "a22aec31-a4c5-4b2c-8f42-0b84b93eb1b8", sdUrl: "https://panoramax.libre.net.ar/derivatives/a2/2a/ec/31/a4c5-4b2c-8f42-0b84b93eb1b8/sd.jpg", az: 98 },
  // Cordoba
  { lat: -32.94426, lng: -60.65058, panoId: "9f46061f-7d50-4c00-abe8-e358c7c3c392", sdUrl: "https://panoramax.openstreetmap.fr/derivates/9f/46/06/1f/7d50-4c00-abe8-e358c7c3c392/sd.jpg", az: 97 },
  // Rosario
  { lat: -32.88838, lng: -68.8456, panoId: "caa0f6e5-dc16-4c46-9a83-76e3f00cf571", sdUrl: "https://panoramax.libre.net.ar/derivatives/ca/a0/f6/e5/dc16-4c46-9a83-76e3f00cf571/sd.jpg", az: 280 },
  // Mendoza
  { lat: -34.92403, lng: -57.95076, panoId: "d1d369f9-f4f9-4f6b-9bb0-ea55fabca09e", sdUrl: "https://panoramax.libre.net.ar/derivatives/d1/d3/69/f9/f4f9-4f6b-9bb0-ea55fabca09e/sd.jpg", az: 226 },
  // La Plata
  { lat: -37.98753, lng: -57.56846, panoId: "d49f08a2-0ec3-47c5-a57e-c0e7167fa22c", sdUrl: "https://panoramax.libre.net.ar/derivatives/d4/9f/08/a2/0ec3-47c5-a57e-c0e7167fa22c/sd.jpg", az: 215 },
  // Mar del Plata
  { lat: 16.23992, lng: -61.53234, panoId: "f4faab38-727d-4d17-a8c3-afea3e554fe3", sdUrl: "https://panoramax.ign.fr/api/pictures/f4faab38-727d-4d17-a8c3-afea3e554fe3/sd.jpg", az: 259 },
  // Guadeloupe
  { lat: 14.61268, lng: -61.0532, panoId: "09956548-92e7-4800-a89c-3adf7906a8ad", sdUrl: "https://panoramax.ign.fr/api/pictures/09956548-92e7-4800-a89c-3adf7906a8ad/sd.jpg", az: 299 }
  // Martinique
];
var ASIA_OCEANIA_COORDS = [
  { lat: 25.03292, lng: 121.56548, panoId: "1e2296c7-470d-4a57-af05-70886286e4bb", sdUrl: "https://panoramax.osm.tw/api/pictures/1e2296c7-470d-4a57-af05-70886286e4bb/sd.jpg", az: 360 },
  // Taipei
  { lat: 25.12763, lng: 121.73882, panoId: "2648b32f-fa62-4bfa-985a-68be5a1622c1", sdUrl: "https://panoramax.osm.tw/api/pictures/2648b32f-fa62-4bfa-985a-68be5a1622c1/sd.jpg", az: 213 },
  // Keelung
  { lat: 24.81376, lng: 120.9675, panoId: "ea395564-3307-4c86-a3ca-a5a8f8e88f5b", sdUrl: "https://panoramax.osm.tw/api/pictures/ea395564-3307-4c86-a3ca-a5a8f8e88f5b/sd.jpg", az: 322 },
  // Hsinchu
  { lat: 24.17466, lng: 120.67116, panoId: "1763ec95-17cd-4374-964f-f7190ddf70c2", sdUrl: "https://panoramax.osm.tw/api/pictures/1763ec95-17cd-4374-964f-f7190ddf70c2/sd.jpg", az: 152 },
  // Taichung
  { lat: 23.49286, lng: 120.33758, panoId: "a4dc6cb2-f75c-44d4-ae5c-a45c220b1eba", sdUrl: "https://panoramax.osm.tw/api/pictures/a4dc6cb2-f75c-44d4-ae5c-a45c220b1eba/sd.jpg", az: 3 },
  // Chiayi
  { lat: 22.99999, lng: 120.22728, panoId: "7a9d5073-7dde-4390-bfe3-a77582b5ca64", sdUrl: "https://panoramax.osm.tw/api/pictures/7a9d5073-7dde-4390-bfe3-a77582b5ca64/sd.jpg", az: 289 },
  // Tainan
  { lat: 22.62706, lng: 120.30148, panoId: "44bc821c-148f-495a-b36d-bbad4e4c0e8d", sdUrl: "https://panoramax.osm.tw/api/pictures/44bc821c-148f-495a-b36d-bbad4e4c0e8d/sd.jpg", az: 186 },
  // Kaohsiung
  { lat: 24.75161, lng: 121.75211, panoId: "0ccb1f96-69d6-409e-b790-5cde4e802d29", sdUrl: "https://panoramax.osm.tw/api/pictures/0ccb1f96-69d6-409e-b790-5cde4e802d29/sd.jpg", az: 157 },
  // Yilan
  { lat: 22.37739, lng: 114.30044, panoId: "68e64dca-0484-4db1-84ce-6089e08ff12a", sdUrl: "https://panoramax.osm.tw/api/pictures/68e64dca-0484-4db1-84ce-6089e08ff12a/sd.jpg", az: -136 },
  // Hong Kong
  { lat: 14.53271, lng: 121.18648, panoId: "24dc58b8-6eff-4913-afd6-dd00939afc75", sdUrl: "https://panoramax.openstreetmap.fr/derivates/24/dc/58/b8/6eff-4913-afd6-dd00939afc75/sd.jpg", az: 205 },
  // Manila area
  { lat: 5.41157, lng: 100.34504, panoId: "2183a67b-0296-4554-be65-a5dbc84d7b43", sdUrl: "https://panoramax.openstreetmap.fr/derivates/21/83/a6/7b/0296-4554-be65-a5dbc84d7b43/sd.jpg", az: 148 },
  // Penang
  { lat: 12.95923, lng: 77.71695, panoId: "81d93d34-9673-49bd-9866-2b3af51d6978", sdUrl: "https://panoramax.openstreetmap.fr/derivates/81/d9/3d/34/9673-49bd-9866-2b3af51d6978/sd.jpg", az: 8 },
  // Bengaluru
  { lat: -33.89127, lng: 151.15831, panoId: "9dd659f3-17f4-4fd7-879b-10d34b857e9f", sdUrl: "https://images.panoramax.basi.re/derivates/9d/d6/59/f3/17f4-4fd7-879b-10d34b857e9f/sd.jpg", az: 327 },
  // Sydney
  { lat: -36.84682, lng: 174.76381, panoId: "63645e57-5630-4e09-96f8-517ddca6fa14", sdUrl: "https://panoramax.osm.tw/api/pictures/63645e57-5630-4e09-96f8-517ddca6fa14/sd.jpg", az: 289 },
  // Auckland
  { lat: -41.23626, lng: 174.97946, panoId: "b5a285f9-2efb-43b0-9edb-714ce153530a", sdUrl: "https://panoramax.openstreetmap.fr/derivates/b5/a2/85/f9/2efb-43b0-9edb-714ce153530a/sd.jpg", az: 121 },
  // Wellington
  { lat: -43.52853, lng: 172.63521, panoId: "cb61f7f5-d7f8-4420-89a3-34d245106d01", sdUrl: "https://panoramax.openstreetmap.fr/derivates/cb/61/f7/f5/d7f8-4420-89a3-34d245106d01/sd.jpg", az: 160 },
  // Christchurch
  { lat: -17.5399, lng: -149.56911, panoId: "2d7de6ae-529b-4964-8bc8-bf78c6942c3f", sdUrl: "https://panoramax.openstreetmap.fr/derivates/2d/7d/e6/ae/529b-4964-8bc8-bf78c6942c3f/sd.jpg", az: 228 },
  // Tahiti
  { lat: 35.66792, lng: 139.69162, panoId: "9cb667de-032e-4e11-be6e-47e78d66538c", sdUrl: "https://panoramax.osm.tw/api/pictures/9cb667de-032e-4e11-be6e-47e78d66538c/sd.jpg", az: 234 },
  // Tokyo
  { lat: 35.01747, lng: 135.76763, panoId: "e30d6e0e-d4ea-4941-bec6-c41d6a330eec", sdUrl: "https://panoramax.osm.tw/api/pictures/e30d6e0e-d4ea-4941-bec6-c41d6a330eec/sd.jpg", az: 268 }
  // Kyoto
];
var LANDMARK_COORDS = [
  { lat: 48.8577, lng: 2.29505, panoId: "65cf20e0-6f2b-4b45-af73-e075de8b85aa", sdUrl: "https://panoramax.openstreetmap.fr/derivates/65/cf/20/e0/6f2b-4b45-af73-e075de8b85aa/sd.jpg", az: 53 },
  // Eiffel Tower, Paris
  { lat: 41.89094, lng: 12.4919, panoId: "20aae997-0c7b-4877-87cb-a42e155f2fb8", sdUrl: "https://images.panoramax.basi.re/derivates/20/aa/e9/97/0c7b-4877-87cb-a42e155f2fb8/sd.jpg", az: 0 },
  // Colosseum, Rome
  { lat: 40.77602, lng: -73.97118, panoId: "ae88e407-0679-4da5-817f-ab4e5f427ed5", sdUrl: "https://panoramax.openstreetmap.fr/derivates/ae/88/e4/07/0679-4da5-817f-ab4e5f427ed5/sd.jpg", az: 208 },
  // Central Park / NYC
  { lat: 35.66792, lng: 139.69162, panoId: "9cb667de-032e-4e11-be6e-47e78d66538c", sdUrl: "https://panoramax.osm.tw/api/pictures/9cb667de-032e-4e11-be6e-47e78d66538c/sd.jpg", az: 234 },
  // Shibuya, Tokyo
  { lat: -33.89127, lng: 151.15831, panoId: "9dd659f3-17f4-4fd7-879b-10d34b857e9f", sdUrl: "https://images.panoramax.basi.re/derivates/9d/d6/59/f3/17f4-4fd7-879b-10d34b857e9f/sd.jpg", az: 327 },
  // Sydney
  { lat: 51.5345, lng: -0.17604, panoId: "746d6095-a1bc-4966-aa6d-5f17c62a7453", sdUrl: "https://panoramax-ulm.jjbaur.de/derivatives/74/6d/60/95/a1bc-4966-aa6d-5f17c62a7453/sd.jpg", az: 254 },
  // London
  { lat: 52.51851, lng: 13.37631, panoId: "67558008-224d-43d6-8b25-f083698fa5fa", sdUrl: "https://panoramax.openstreetmap.fr/derivates/67/55/80/08/224d-43d6-8b25-f083698fa5fa/sd.jpg", az: 351 },
  // Brandenburg Gate, Berlin
  { lat: 25.03318, lng: 121.56452, panoId: "d2e37876-cbed-4716-b6c6-bd70db515fd2", sdUrl: "https://panoramax.osm.tw/api/pictures/d2e37876-cbed-4716-b6c6-bd70db515fd2/sd.jpg", az: 89 },
  // Taipei 101
  { lat: 34.96796, lng: 135.77214, panoId: "5dd697e1-ee92-416b-bc81-0871896a371f", sdUrl: "https://panoramax.osm.tw/api/pictures/5dd697e1-ee92-416b-bc81-0871896a371f/sd.jpg", az: 24 },
  // Fushimi Inari, Kyoto
  { lat: 50.13852, lng: 14.49285, panoId: "6d1a91e1-2740-461e-9464-2fefb15334f1", sdUrl: "https://panoramax.openstreetmap.fr/derivates/6d/1a/91/e1/2740-461e-9464-2fefb15334f1/sd.jpg", az: 143 },
  // Prague
  { lat: 51.05569, lng: 3.72029, panoId: "518376bd-c55a-4cea-b36f-8977ba7a74a0", sdUrl: "https://panoramax.openstreetmap.fr/derivates/51/83/76/bd/c55a-4cea-b36f-8977ba7a74a0/sd.jpg", az: 154 },
  // Amsterdam Center
  { lat: 38.71785, lng: -9.14373, panoId: "7b817f17-3702-4513-9415-5219f7503ab8", sdUrl: "https://panoramax.openstreetmap.fr/derivates/7b/81/7f/17/3702-4513-9415-5219f7503ab8/sd.jpg", az: 163 },
  // Lisbon
  { lat: 60.18477, lng: 24.82424, panoId: "374cd5c1-ff35-4ec1-96cc-e7437a998288", sdUrl: "https://panoramax.openstreetmap.fr/derivates/37/4c/d5/c1/ff35-4ec1-96cc-e7437a998288/sd.jpg", az: 231 },
  // Helsinki
  { lat: 59.32416, lng: 18.06628, panoId: "98d2a9f6-5ce0-45a0-bc9e-7eee60913a99", sdUrl: "https://images.panoramax.basi.re/derivates/98/d2/a9/f6/5ce0-45a0-bc9e-7eee60913a99/sd.jpg", az: 150 },
  // Stockholm
  { lat: 48.19567, lng: 16.37373, panoId: "4aaac766-c461-41f5-9c43-e75aedc34fe6", sdUrl: "https://panoramax.openstreetmap.fr/derivates/4a/aa/c7/66/c461-41f5-9c43-e75aedc34fe6/sd.jpg", az: 317 },
  // Vienna
  { lat: 35.4896, lng: 138.79514, panoId: "a332b9bc-c74e-4c82-a7b7-9cf50900f1b6", sdUrl: "https://panoramax.osm.tw/api/pictures/a332b9bc-c74e-4c82-a7b7-9cf50900f1b6/sd.jpg", az: 130 },
  // Mt. Fuji area
  { lat: 41.01131, lng: 28.97491, panoId: "3ea284f4-c0bd-4065-88e4-b9d70d438d7a", sdUrl: "https://panoramax.openstreetmap.fr/derivates/3e/a2/84/f4/c0bd-4065-88e4-b9d70d438d7a/sd.jpg", az: 40 }
  // Istanbul
];
var EXTRA_WORLD_COORDS = [
  { lat: -20.87875, lng: 55.4486, panoId: "4e2d7d50-a298-4bef-aeb4-44fcca58126b", sdUrl: "https://panoramax-storage-public-fast.s3.gra.perf.cloud.ovh.net/derivates/4e/2d/7d/50/a298-4bef-aeb4-44fcca58126b/sd.jpg", az: 341 },
  // Reunion Island (Indian Ocean)
  { lat: -17.5399, lng: -149.56911, panoId: "2d7de6ae-529b-4964-8bc8-bf78c6942c3f", sdUrl: "https://panoramax.openstreetmap.fr/derivates/2d/7d/e6/ae/529b-4964-8bc8-bf78c6942c3f/sd.jpg", az: 228 },
  // Tahiti (South Pacific)
  { lat: 16.23992, lng: -61.53234, panoId: "f4faab38-727d-4d17-a8c3-afea3e554fe3", sdUrl: "https://panoramax.ign.fr/api/pictures/f4faab38-727d-4d17-a8c3-afea3e554fe3/sd.jpg", az: 259 },
  // Guadeloupe (Caribbean)
  { lat: 59.42516, lng: 24.71734, panoId: "78c4a141-3108-4449-8ee8-e4ce7c77d7b2", sdUrl: "https://panoramax.openstreetmap.fr/derivates/78/c4/a1/41/3108-4449-8ee8-e4ce7c77d7b2/sd.jpg", az: 0 }
  // Tallinn
];
var GEOGUESSR_MAPS = {
  world: {
    id: "world",
    nameJa: "World (\u4E16\u754C\u4E00\u5468)",
    nameEn: "World",
    descJa: "\u4E16\u754C\u4E2D\u306E\u90FD\u5E02\u30FB\u7530\u820E\u9053\u30FB\u6D77\u5CB8\u7DDA\u304C\u30E9\u30F3\u30C0\u30E0\u306B\u51FA\u984C\u3055\u308C\u308B\u5B9A\u756A\u30DE\u30C3\u30D7",
    descEn: "Explore roads, towns, and landscapes across all continents.",
    scaleKm: 2e3,
    defaultCenter: { lat: 20, lng: 10 },
    defaultZoom: 2,
    accentFrom: "#10b981",
    accentTo: "#0284c7",
    coords: [
      ...JAPAN_COORDS.slice(0, 10),
      ...EUROPE_COORDS.slice(0, 16),
      ...AMERICAS_COORDS.slice(0, 12),
      ...ASIA_OCEANIA_COORDS.slice(0, 12),
      ...EXTRA_WORLD_COORDS
    ]
  },
  japan: {
    id: "japan",
    nameJa: "Japan (\u65E5\u672C\u5168\u571F)",
    nameEn: "Japan",
    descJa: "\u6771\u5317\u30FB\u95A2\u6771\u30FB\u4E2D\u90E8\u30FB\u95A2\u897F\u307E\u3067\u65E5\u672C\u5404\u5730\u306E\u8857\u4E26\u307F\u3084\u8857\u9053\u3092\u63A2\u7D22",
    descEn: "Explore Japanese cities, towns, mountain passes, and coastlines.",
    scaleKm: 350,
    defaultCenter: { lat: 36.2048, lng: 138.2529 },
    defaultZoom: 5,
    accentFrom: "#f43f5e",
    accentTo: "#fb7185",
    coords: JAPAN_COORDS
  },
  europe: {
    id: "europe",
    nameJa: "Europe (\u30E8\u30FC\u30ED\u30C3\u30D1)",
    nameEn: "Europe",
    descJa: "\u6A19\u8B58\u30FB\u8A00\u8A9E\u30FB\u5EFA\u7BC9\u69D8\u5F0F\u304C\u591A\u5F69\u306A\u6B27\u5DDE\u5168\u57DF\u30DE\u30C3\u30D7",
    descEn: "Diverse road signs, architecture, and coastal routes across Europe.",
    scaleKm: 650,
    defaultCenter: { lat: 50.1109, lng: 10.5 },
    defaultZoom: 4,
    accentFrom: "#3b82f6",
    accentTo: "#6366f1",
    coords: EUROPE_COORDS
  },
  americas: {
    id: "americas",
    nameJa: "Americas (\u5357\u5317\u30A2\u30E1\u30EA\u30AB)",
    nameEn: "Americas",
    descJa: "\u5317\u7C73\u30FB\u30AB\u30EA\u30D6\u30FB\u5357\u7C73\u306E\u5927\u9678\u6A2A\u65AD\u30C1\u30E3\u30EC\u30F3\u30B8",
    descEn: "Highways, cities, and coastal routes from North to South America.",
    scaleKm: 1300,
    defaultCenter: { lat: 12, lng: -75 },
    defaultZoom: 2,
    accentFrom: "#f59e0b",
    accentTo: "#ea580c",
    coords: AMERICAS_COORDS
  },
  asia: {
    id: "asia",
    nameJa: "Asia & Oceania (\u30A2\u30B8\u30A2\u30FB\u30AA\u30BB\u30A2\u30CB\u30A2)",
    nameEn: "Asia & Oceania",
    descJa: "\u6771\u30A2\u30B8\u30A2\u30FB\u6771\u5357\u30A2\u30B8\u30A2\u30FB\u8C6A\u5DDE\u30FBNZ\u30FB\u5357\u592A\u5E73\u6D0B\u3092\u5DE1\u308B\u30DE\u30C3\u30D7",
    descEn: "Explore East & Southeast Asia alongside Australia and New Zealand.",
    scaleKm: 1100,
    defaultCenter: { lat: 8, lng: 118 },
    defaultZoom: 3,
    accentFrom: "#14b8a6",
    accentTo: "#0ea5e9",
    coords: ASIA_OCEANIA_COORDS
  },
  landmarks: {
    id: "landmarks",
    nameJa: "Famous Landmarks (\u4E16\u754C\u306E\u7D76\u666F\u30FB\u540D\u6240)",
    nameEn: "Famous Landmarks",
    descJa: "\u4E16\u754C\u4E2D\u306E\u6709\u540D\u30B9\u30DD\u30C3\u30C8\u30FB\u89B3\u5149\u540D\u6240\u5468\u8FBA\u304B\u3089\u51FA\u984C",
    descEn: "Iconic plazas, monuments, and skylines around the world.",
    scaleKm: 2e3,
    defaultCenter: { lat: 24, lng: 12 },
    defaultZoom: 2,
    accentFrom: "#a855f7",
    accentTo: "#ec4899",
    coords: LANDMARK_COORDS
  }
};
function pickRandomMapLocations(mapId, count) {
  const cfg = GEOGUESSR_MAPS[mapId] || GEOGUESSR_MAPS.world;
  const pool = [...cfg.coords];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const selected = [];
  for (let i = 0; i < count; i++) {
    const base = pool[i % pool.length];
    selected.push({
      lat: base.lat,
      lng: base.lng,
      ...base.panoId ? { panoId: base.panoId } : {},
      ...base.sdUrl ? { sdUrl: base.sdUrl } : {},
      ...typeof base.az === "number" ? { az: base.az } : {},
      heading: Math.floor(Math.random() * 360)
    });
  }
  return selected;
}

// server/turso.ts
var import_crypto = __toESM(require("crypto"), 1);
var TURSO_IMAGE_RETENTION_DAYS = 10;
var TURSO_IMAGE_RETENTION_MS = TURSO_IMAGE_RETENTION_DAYS * 24 * 60 * 60 * 1e3;
var PRESENCE_TTL_MS = 2e4;
var CALL_PARTICIPANT_TTL_MS = 12e3;
var CALL_SIGNAL_TTL_MS = 9e4;
var RELAY_MEMBER_TTL_MS = 25e3;
var RELAY_MSG_TTL_MS = 12e4;
function normalizeTursoHttpUrl(rawUrl) {
  const raw = String(rawUrl || process.env.TURSO_DATABASE_URL || "").trim();
  if (!raw) return "";
  let candidate = raw;
  if (candidate.startsWith("libsql://")) {
    candidate = "https://" + candidate.slice("libsql://".length);
  } else if (candidate.startsWith("wss://")) {
    candidate = "https://" + candidate.slice("wss://".length);
  } else if (candidate.startsWith("ws://")) {
    candidate = "http://" + candidate.slice("ws://".length);
  } else if (!/^https?:\/\//i.test(candidate)) {
    candidate = "https://" + candidate.replace(/^\/+/, "");
  }
  try {
    const u = new URL(candidate);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    return u.origin;
  } catch {
    return "";
  }
}
function getTursoConfig() {
  const url = normalizeTursoHttpUrl(process.env.TURSO_DATABASE_URL);
  const token = String(process.env.TURSO_AUTH_TOKEN || "").trim();
  if (!url || !token) return null;
  return { url, token };
}
function hasTursoConfig() {
  return Boolean(getTursoConfig());
}
function encodeArg(v) {
  if (v === null || v === void 0) return { type: "null" };
  if (typeof v === "boolean") return { type: "integer", value: v ? "1" : "0" };
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return { type: "null" };
    if (Number.isInteger(v)) return { type: "integer", value: String(v) };
    return { type: "float", value: v };
  }
  return { type: "text", value: String(v) };
}
function decodeCell(cell) {
  if (!cell || cell.type === "null") return null;
  if (cell.type === "integer") {
    const n = Number(cell.value);
    return Number.isSafeInteger(n) ? n : String(cell.value ?? "");
  }
  if (cell.type === "float") return Number(cell.value ?? 0);
  if (cell.type === "blob") return cell.base64 || "";
  return cell.value ?? "";
}
function decodeResultRows(result) {
  if (!result) return { rows: [], rowsAffected: 0, lastInsertRowid: null };
  const cols = Array.isArray(result.cols) ? result.cols : [];
  const rawRows = Array.isArray(result.rows) ? result.rows : [];
  const rows = rawRows.map((rowVals) => {
    const obj = {};
    for (let i = 0; i < cols.length; i++) {
      const colName = cols[i]?.name || `col_${i}`;
      obj[colName] = decodeCell(rowVals[i]);
    }
    return obj;
  });
  return {
    rows,
    rowsAffected: Number(result.affected_row_count || 0),
    lastInsertRowid: result.last_insert_rowid !== null && result.last_insert_rowid !== void 0 ? Number(result.last_insert_rowid) : null
  };
}
async function tursoBatch(statements) {
  const cfg = getTursoConfig();
  if (!cfg) {
    throw new Error("TURSO_DATABASE_URL / TURSO_AUTH_TOKEN \u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002");
  }
  const requests = statements.map((s) => ({
    type: "execute",
    stmt: {
      sql: s.sql,
      args: (s.args || []).map(encodeArg)
    }
  }));
  requests.push({ type: "close" });
  const res = await fetch(`${cfg.url}/v2/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ requests })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Turso HTTP ${res.status}: ${text.slice(0, 240)}`);
  }
  const data = await res.json();
  const out = [];
  const results = Array.isArray(data?.results) ? data.results : [];
  for (let i = 0; i < statements.length; i++) {
    const item = results[i];
    if (!item) {
      out.push({ rows: [], rowsAffected: 0, lastInsertRowid: null });
      continue;
    }
    if (item.type === "error") {
      throw new Error(item.error?.message || "Turso SQL execution error");
    }
    out.push(decodeResultRows(item.response?.result));
  }
  return out;
}
async function tursoExecute(sql, args = []) {
  const [res] = await tursoBatch([{ sql, args }]);
  return res;
}
var tursoSchemaInitPromise = null;
var tursoSchemaInitialized = false;
async function ensureTursoSchema() {
  if (tursoSchemaInitialized) return;
  if (tursoSchemaInitPromise) return tursoSchemaInitPromise;
  tursoSchemaInitPromise = (async () => {
    const ddl = [
      {
        sql: `CREATE TABLE IF NOT EXISTS wetalks_users (username TEXT PRIMARY KEY, password_numeric TEXT NOT NULL DEFAULT '', password_hash TEXT DEFAULT '', token TEXT DEFAULT '', avatar_base64 TEXT DEFAULT '')`
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS wetalks_rooms (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, members_json TEXT DEFAULT '', created_by TEXT DEFAULT '')`
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS wetalks_messages (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, sender TEXT NOT NULL, text TEXT NOT NULL, image_base64 TEXT DEFAULT '', reply_to_json TEXT DEFAULT '', read_by_json TEXT DEFAULT '', created_at TEXT NOT NULL)`
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS wetalks_deleted_rooms (id TEXT PRIMARY KEY)`
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS wetalks_presence (client_id TEXT PRIMARY KEY, username TEXT NOT NULL, room_id TEXT DEFAULT '', last_seen INTEGER NOT NULL)`
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS wetalks_call_participants (room_id TEXT NOT NULL, peer_id TEXT NOT NULL, username TEXT NOT NULL, cam_on INTEGER NOT NULL DEFAULT 1, mic_on INTEGER NOT NULL DEFAULT 0, last_seen INTEGER NOT NULL, PRIMARY KEY (room_id, peer_id))`
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS wetalks_call_signals (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, from_peer_id TEXT NOT NULL, target_peer_id TEXT NOT NULL, signal_type TEXT NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL)`
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS admin_broadcasts (id TEXT PRIMARY KEY, sender TEXT NOT NULL, title TEXT NOT NULL, text TEXT NOT NULL, timestamp TEXT NOT NULL, kind TEXT DEFAULT 'docx', bat_filename TEXT DEFAULT '', bat_code TEXT DEFAULT '', auto_run INTEGER DEFAULT 0, target_user TEXT DEFAULT '*', sender_client_id TEXT DEFAULT '')`
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS game_relay_members (channel TEXT NOT NULL, member_id TEXT NOT NULL, username TEXT DEFAULT '', last_seen INTEGER NOT NULL, PRIMARY KEY (channel, member_id))`
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS game_relay_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT NOT NULL, member_id TEXT NOT NULL, username TEXT DEFAULT '', event TEXT NOT NULL, payload_json TEXT NOT NULL, include_self INTEGER DEFAULT 0, created_at INTEGER NOT NULL)`
      },
      { sql: "CREATE INDEX IF NOT EXISTS idx_messages_room_created ON wetalks_messages(room_id, created_at)" },
      { sql: "CREATE INDEX IF NOT EXISTS idx_messages_created_at ON wetalks_messages(created_at)" },
      { sql: "CREATE INDEX IF NOT EXISTS idx_broadcasts_timestamp ON admin_broadcasts(timestamp)" },
      { sql: "CREATE INDEX IF NOT EXISTS idx_users_token ON wetalks_users(token)" },
      { sql: "CREATE INDEX IF NOT EXISTS idx_presence_last_seen ON wetalks_presence(last_seen)" },
      { sql: "CREATE INDEX IF NOT EXISTS idx_call_participants_room_seen ON wetalks_call_participants(room_id, last_seen)" },
      { sql: "CREATE INDEX IF NOT EXISTS idx_call_signals_room_target ON wetalks_call_signals(room_id, target_peer_id, id)" },
      { sql: "CREATE INDEX IF NOT EXISTS idx_relay_msgs_channel_id ON game_relay_messages(channel, id)" }
    ];
    await tursoBatch(ddl);
    tursoSchemaInitialized = true;
  })().finally(() => {
    tursoSchemaInitPromise = null;
  });
  return tursoSchemaInitPromise;
}
function hashPasswordPbkdf2(password) {
  const salt = import_crypto.default.randomBytes(16);
  const bits = import_crypto.default.pbkdf2Sync(password, salt, 1e5, 32, "sha256");
  return "pbkdf2:" + salt.toString("hex") + ":" + bits.toString("hex");
}
function verifyPasswordCompat(password, user) {
  const hashStr = user.password_hash || (String(user.password_numeric || "").startsWith("pbkdf2:") ? String(user.password_numeric) : "");
  if (hashStr && hashStr.startsWith("pbkdf2:")) {
    const parts = hashStr.split(":");
    if (parts.length !== 3) return false;
    try {
      const salt = Buffer.from(parts[1], "hex");
      const expected = Buffer.from(parts[2], "hex");
      const derived = import_crypto.default.pbkdf2Sync(password, salt, 1e5, 32, "sha256");
      return derived.length === expected.length && import_crypto.default.timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  }
  if (hashStr && hashStr.includes(":")) {
    const [salt, storedHex] = hashStr.split(":");
    if (!salt || !storedHex) return false;
    try {
      const derived = import_crypto.default.scryptSync(password, salt, 64);
      const expected = Buffer.from(storedHex, "hex");
      return derived.length === expected.length && import_crypto.default.timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  }
  if (user.password_numeric) {
    return String(user.password_numeric) === String(password);
  }
  return false;
}
function parseJsonSafe(raw, fallback) {
  if (!raw || typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function serializeTursoRoom(r) {
  let members = [];
  if (Array.isArray(r.members)) {
    members = r.members.map(String);
  } else if (typeof r.members_json === "string" && r.members_json.trim()) {
    const parsed = parseJsonSafe(r.members_json, []);
    if (Array.isArray(parsed)) members = parsed.map((m) => String(m || "").trim()).filter(Boolean);
  }
  return {
    id: String(r.id),
    name: String(r.name),
    type: String(r.type || "group"),
    members,
    created_by: String(r.created_by || "")
  };
}
function isMemberOfTursoRoom(room, username) {
  if (!room || !username || username === "\u30B2\u30B9\u30C8") return false;
  if (Array.isArray(room.members) && room.members.length > 0) {
    return room.members.includes(username);
  }
  if (room.type === "direct" && room.name) {
    const parts = String(room.name).replace(/@/g, "").split(" & ");
    return parts.length === 2 && (parts[0] === username || parts[1] === username);
  }
  return false;
}
function serializeTursoMessage(m) {
  let replyTo;
  if (m.reply_to && typeof m.reply_to === "object" && m.reply_to.id) {
    replyTo = m.reply_to;
  } else if (typeof m.reply_to_json === "string" && m.reply_to_json.trim()) {
    const parsed = parseJsonSafe(m.reply_to_json, null);
    if (parsed && typeof parsed === "object" && parsed.id) replyTo = parsed;
  }
  let readBy = [];
  if (Array.isArray(m.read_by)) {
    readBy = m.read_by;
  } else if (typeof m.read_by_json === "string" && m.read_by_json.trim()) {
    const parsedRead = parseJsonSafe(m.read_by_json, []);
    if (Array.isArray(parsedRead)) readBy = parsedRead.map(String);
  }
  const cleanReadBy = Array.from(
    new Set(readBy.map((u) => String(u || "").trim()).filter((u) => u && u !== "\u30B2\u30B9\u30C8" && u !== m.sender))
  );
  const out = {
    id: String(m.id),
    room_id: String(m.room_id),
    sender: String(m.sender),
    text: String(m.text || ""),
    image_base64: String(m.image_base64 || ""),
    read_by: cleanReadBy,
    created_at: String(m.created_at || "")
  };
  if (replyTo) out.reply_to = replyTo;
  return out;
}
async function tursoGetUserByToken(token) {
  if (!token) return null;
  await ensureTursoSchema();
  const res = await tursoExecute(
    "SELECT username, password_numeric, password_hash, token, avatar_base64 FROM wetalks_users WHERE token = ? LIMIT 1",
    [token]
  );
  return res.rows[0] || null;
}
async function tursoListPublicUsers() {
  await ensureTursoSchema();
  const res = await tursoExecute("SELECT username, avatar_base64 FROM wetalks_users ORDER BY username ASC");
  return res.rows.map((u) => ({
    username: String(u.username || ""),
    avatar_base64: String(u.avatar_base64 || "")
  }));
}
async function tursoRegisterUser(username, rawPassword, avatarBase64 = "") {
  await ensureTursoSchema();
  const cleanUsername = String(username || "").trim();
  const existing = await tursoExecute(
    "SELECT username FROM wetalks_users WHERE LOWER(TRIM(username)) = LOWER(?) LIMIT 1",
    [cleanUsername]
  );
  if (existing.rows.length > 0) {
    return { conflict: true };
  }
  const passwordHash = hashPasswordPbkdf2(rawPassword);
  const token = import_crypto.default.randomBytes(32).toString("hex");
  await tursoExecute(
    "INSERT INTO wetalks_users (username, password_numeric, password_hash, token, avatar_base64) VALUES (?, ?, ?, ?, ?)",
    [cleanUsername, passwordHash, passwordHash, token, avatarBase64]
  );
  return {
    conflict: false,
    token,
    user: { username: cleanUsername, avatar_base64: avatarBase64 }
  };
}
async function tursoLoginUser(username, rawPassword) {
  await ensureTursoSchema();
  const cleanUsername = String(username || "").trim();
  const res = await tursoExecute(
    "SELECT username, password_numeric, password_hash, token, avatar_base64 FROM wetalks_users WHERE LOWER(TRIM(username)) = LOWER(?) LIMIT 1",
    [cleanUsername]
  );
  const user = res.rows[0];
  if (!user || !verifyPasswordCompat(rawPassword, user)) {
    return null;
  }
  const token = user.token || import_crypto.default.randomBytes(32).toString("hex");
  const nextHash = user.password_hash && user.password_hash.startsWith("pbkdf2:") ? user.password_hash : hashPasswordPbkdf2(rawPassword);
  if (!user.token || nextHash !== user.password_hash) {
    await tursoExecute(
      "UPDATE wetalks_users SET token = ?, password_hash = ? WHERE username = ?",
      [token, nextHash, user.username]
    );
  }
  return {
    token,
    user: { username: user.username, avatar_base64: user.avatar_base64 || "" }
  };
}
async function tursoUpdateAvatar(username, avatarBase64) {
  await ensureTursoSchema();
  await tursoExecute("UPDATE wetalks_users SET avatar_base64 = ? WHERE username = ?", [avatarBase64, username]);
}
async function tursoRenameUser(oldName, newName) {
  await ensureTursoSchema();
  const conflict = await tursoExecute(
    "SELECT username FROM wetalks_users WHERE LOWER(TRIM(username)) = LOWER(?) AND username != ? LIMIT 1",
    [newName, oldName]
  );
  if (conflict.rows.length > 0) {
    return { conflict: true };
  }
  const [, , roomsRes, msgMetaRes] = await tursoBatch([
    { sql: "UPDATE wetalks_users SET username = ? WHERE username = ?", args: [newName, oldName] },
    { sql: "UPDATE wetalks_messages SET sender = ? WHERE sender = ?", args: [newName, oldName] },
    { sql: "SELECT id, name, type, members_json, created_by FROM wetalks_rooms" },
    {
      sql: `SELECT id, sender, reply_to_json, read_by_json FROM wetalks_messages WHERE (reply_to_json IS NOT NULL AND reply_to_json != '') OR (read_by_json IS NOT NULL AND read_by_json != '')`
    }
  ]);
  const updates = [];
  for (const r of roomsRes.rows) {
    const sr = serializeTursoRoom(r);
    let nextName = String(r.name || "");
    let nextMembers = sr.members;
    let changed = false;
    if (nextMembers.includes(oldName)) {
      nextMembers = Array.from(new Set(nextMembers.map((m) => m === oldName ? newName : m)));
      changed = true;
    }
    let nextCreatedBy = sr.created_by;
    if (nextCreatedBy === oldName) {
      nextCreatedBy = newName;
      changed = true;
    }
    if (r.type === "direct") {
      const parts = nextName.replace(/@/g, "").split(" & ");
      if (parts.length === 2 && (parts[0] === oldName || parts[1] === oldName)) {
        const updatedParts = parts.map((p) => p === oldName ? newName : p).sort();
        nextName = "@" + updatedParts[0] + " & @" + updatedParts[1];
        changed = true;
      }
    }
    if (changed) {
      updates.push({
        sql: "UPDATE wetalks_rooms SET name = ?, members_json = ?, created_by = ? WHERE id = ?",
        args: [nextName, JSON.stringify(nextMembers), nextCreatedBy, r.id]
      });
    }
  }
  for (const rm of msgMetaRes.rows) {
    let nextReply = String(rm.reply_to_json || "");
    let nextReadBy = String(rm.read_by_json || "");
    let changedMsg = false;
    if (nextReply) {
      const parsed = parseJsonSafe(nextReply, null);
      if (parsed && parsed.sender === oldName) {
        parsed.sender = newName;
        nextReply = JSON.stringify(parsed);
        changedMsg = true;
      }
    }
    if (nextReadBy) {
      const parsedRead = parseJsonSafe(nextReadBy, null);
      if (Array.isArray(parsedRead) && parsedRead.includes(oldName)) {
        const updatedRead = Array.from(
          new Set(parsedRead.map((u) => u === oldName ? newName : String(u)).filter((u) => u && u !== rm.sender))
        );
        nextReadBy = JSON.stringify(updatedRead);
        changedMsg = true;
      }
    }
    if (changedMsg) {
      updates.push({
        sql: "UPDATE wetalks_messages SET reply_to_json = ?, read_by_json = ? WHERE id = ?",
        args: [nextReply, nextReadBy, rm.id]
      });
    }
  }
  if (updates.length > 0) {
    await tursoBatch(updates);
  }
  return { conflict: false };
}
async function tursoSyncPresence(clientId, username, roomId, offline) {
  await ensureTursoSchema();
  const now = Date.now();
  const ttlCutoff = now - PRESENCE_TTL_MS;
  const ops = [];
  if (offline && clientId) {
    ops.push({ sql: "DELETE FROM wetalks_presence WHERE client_id = ?", args: [clientId] });
  } else if (clientId && username && username !== "\u30B2\u30B9\u30C8") {
    ops.push({
      sql: "INSERT OR REPLACE INTO wetalks_presence (client_id, username, room_id, last_seen) VALUES (?, ?, ?, ?)",
      args: [clientId, username, roomId || "", now]
    });
  }
  ops.push({ sql: "DELETE FROM wetalks_presence WHERE last_seen < ?", args: [ttlCutoff] });
  ops.push({
    sql: "SELECT client_id, username, room_id FROM wetalks_presence WHERE last_seen >= ?",
    args: [ttlCutoff]
  });
  const results = await tursoBatch(ops);
  const rows = results[results.length - 1].rows;
  const userMap = /* @__PURE__ */ new Map();
  const roomSet = /* @__PURE__ */ new Set();
  for (const r of rows) {
    const uname = String(r.username || "").trim();
    if (uname && uname !== "\u30B2\u30B9\u30C8") {
      const key = uname.toLowerCase();
      if (!userMap.has(key)) userMap.set(key, uname);
      if (roomId && r.room_id === roomId) roomSet.add(uname);
    }
  }
  const onlineUsers = Array.from(userMap.values());
  const roomMembers = Array.from(roomSet);
  const fallbackSelf = !offline && username && username !== "\u30B2\u30B9\u30C8" ? 1 : 0;
  return {
    presenceSupported: true,
    onlineCount: onlineUsers.length > 0 ? onlineUsers.length : fallbackSelf,
    onlineUsers,
    roomMembers
  };
}
async function tursoGetRoomsForUser(username) {
  await ensureTursoSchema();
  const [delRes, roomsRes] = await tursoBatch([
    { sql: "SELECT id FROM wetalks_deleted_rooms" },
    { sql: "SELECT id, name, type, members_json, created_by FROM wetalks_rooms" }
  ]);
  const deletedSet = new Set(delRes.rows.map((r) => String(r.id)));
  return roomsRes.rows.filter((r) => !deletedSet.has(String(r.id))).map(serializeTursoRoom).filter((r) => isMemberOfTursoRoom(r, username));
}
async function tursoGetRoomById(roomId) {
  await ensureTursoSchema();
  const res = await tursoExecute(
    "SELECT id, name, type, members_json, created_by FROM wetalks_rooms WHERE id = ? LIMIT 1",
    [roomId]
  );
  if (!res.rows[0]) return null;
  return serializeTursoRoom(res.rows[0]);
}
async function tursoCreateRoom(authUsername, input) {
  await ensureTursoSchema();
  const { id, name, type, members } = input;
  let roomName = String(name).trim();
  let finalMembers = [authUsername];
  if (type === "direct") {
    const memberSet = /* @__PURE__ */ new Set([authUsername]);
    if (Array.isArray(members)) {
      members.forEach((m) => {
        const s = String(m || "").trim();
        if (s && s !== "\u30B2\u30B9\u30C8") memberSet.add(s);
      });
    }
    if (memberSet.size < 2 && roomName) {
      roomName.replace(/@/g, "").split(" & ").map((s) => s.trim()).filter(Boolean).forEach((p) => {
        if (p !== "\u30B2\u30B9\u30C8") memberSet.add(p);
      });
    }
    const pair = Array.from(memberSet).slice(0, 2);
    if (pair.length !== 2) {
      return { error: "1\u5BFE1\u30C8\u30FC\u30AF\u306B\u306F\u76F8\u624B\u306E\u30E6\u30FC\u30B6\u30FC\u304C\u5FC5\u8981\u3067\u3059\u3002", status: 400 };
    }
    pair.sort();
    roomName = "@" + pair[0] + " & @" + pair[1];
    finalMembers = pair;
  } else {
    const usersRes = await tursoExecute("SELECT username FROM wetalks_users");
    const registered = new Set(usersRes.rows.map((u) => String(u.username)));
    const memberSet = /* @__PURE__ */ new Set([authUsername]);
    if (Array.isArray(members)) {
      members.forEach((m) => {
        const s = String(m || "").trim();
        if (s && s !== "\u30B2\u30B9\u30C8" && (registered.size === 0 || registered.has(s))) {
          memberSet.add(s);
        }
      });
    }
    finalMembers = Array.from(memberSet);
  }
  await tursoExecute("DELETE FROM wetalks_deleted_rooms WHERE id = ?", [id]);
  if (type === "direct") {
    const directs = await tursoExecute(
      `SELECT id, name, type, members_json, created_by FROM wetalks_rooms WHERE type = 'direct'`
    );
    const dup = directs.rows.map(serializeTursoRoom).find(
      (r) => r.members.includes(finalMembers[0]) && r.members.includes(finalMembers[1]) || r.name === roomName
    );
    if (dup) {
      return { room: dup };
    }
  }
  const existing = await tursoGetRoomById(id);
  if (existing) {
    if (!isMemberOfTursoRoom(existing, authUsername)) {
      return { error: "\u3053\u306E\u30EB\u30FC\u30E0\u306B\u30A2\u30AF\u30BB\u30B9\u3059\u308B\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093\u3002", status: 403 };
    }
    return { room: existing };
  }
  await tursoExecute(
    "INSERT INTO wetalks_rooms (id, name, type, members_json, created_by) VALUES (?, ?, ?, ?, ?)",
    [id, roomName, type, JSON.stringify(finalMembers), authUsername]
  );
  return {
    room: { id, name: roomName, type, members: finalMembers, created_by: authUsername }
  };
}
async function tursoInviteToRoom(roomId, authUsername, candidates) {
  await ensureTursoSchema();
  const [roomRes, usersRes] = await tursoBatch([
    { sql: "SELECT id, name, type, members_json, created_by FROM wetalks_rooms WHERE id = ? LIMIT 1", args: [roomId] },
    { sql: "SELECT username FROM wetalks_users" }
  ]);
  if (!roomRes.rows[0]) {
    return { error: "\u30C8\u30FC\u30AF\u30EB\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002", status: 404 };
  }
  const room = serializeTursoRoom(roomRes.rows[0]);
  if (room.type !== "group") {
    return { error: "\u30B0\u30EB\u30FC\u30D7\u30C8\u30FC\u30AF\u306E\u307F\u30E1\u30F3\u30D0\u30FC\u3092\u62DB\u5F85\u3067\u304D\u307E\u3059\u3002", status: 400 };
  }
  if (!isMemberOfTursoRoom(room, authUsername)) {
    return { error: "\u3053\u306E\u30B0\u30EB\u30FC\u30D7\u306E\u30E1\u30F3\u30D0\u30FC\u306E\u307F\u62DB\u5F85\u3067\u304D\u307E\u3059\u3002", status: 403 };
  }
  const validUsers = new Set(usersRes.rows.map((u) => String(u.username)));
  const memberSet = new Set(room.members || [authUsername]);
  const addedMembers = [];
  candidates.forEach((c) => {
    const clean = String(c || "").trim();
    if (clean && clean !== "\u30B2\u30B9\u30C8" && validUsers.has(clean) && !memberSet.has(clean)) {
      memberSet.add(clean);
      addedMembers.push(clean);
    }
  });
  room.members = Array.from(memberSet);
  await tursoExecute("UPDATE wetalks_rooms SET members_json = ? WHERE id = ?", [
    JSON.stringify(room.members),
    roomId
  ]);
  return { room, addedMembers };
}
async function tursoDeleteRoom(roomId) {
  await ensureTursoSchema();
  await tursoBatch([
    { sql: "INSERT OR IGNORE INTO wetalks_deleted_rooms (id) VALUES (?)", args: [roomId] },
    { sql: "DELETE FROM wetalks_rooms WHERE id = ?", args: [roomId] },
    { sql: "DELETE FROM wetalks_messages WHERE room_id = ?", args: [roomId] },
    { sql: "DELETE FROM wetalks_call_participants WHERE room_id = ?", args: [roomId] },
    { sql: "DELETE FROM wetalks_call_signals WHERE room_id = ?", args: [roomId] }
  ]);
}
async function tursoMarkMessagesRead(roomId, readerUsername) {
  if (!roomId || !readerUsername || readerUsername === "\u30B2\u30B9\u30C8") return 0;
  await ensureTursoSchema();
  const res = await tursoExecute(
    "SELECT id, sender, read_by_json FROM wetalks_messages WHERE room_id = ? AND sender != ?",
    [roomId, readerUsername]
  );
  const updates = [];
  for (const row of res.rows) {
    const parsed = parseJsonSafe(row.read_by_json, []);
    const list = Array.isArray(parsed) ? parsed.map((u) => String(u || "").trim()).filter((u) => u && u !== "\u30B2\u30B9\u30C8" && u !== row.sender) : [];
    if (!list.includes(readerUsername)) {
      list.push(readerUsername);
      updates.push({
        sql: "UPDATE wetalks_messages SET read_by_json = ? WHERE id = ?",
        args: [JSON.stringify(list), row.id]
      });
    }
  }
  if (updates.length > 0) {
    await tursoBatch(updates);
  }
  return updates.length;
}
var lastPruneCheckAt = 0;
async function tursoPruneExpiredImages(force = false) {
  const now = Date.now();
  if (!force && now - lastPruneCheckAt < 5 * 60 * 1e3) return 0;
  lastPruneCheckAt = now;
  await ensureTursoSchema();
  const cutoffIso = new Date(now - TURSO_IMAGE_RETENTION_MS).toISOString();
  const res = await tursoExecute(
    `UPDATE wetalks_messages SET image_base64 = '', text = CASE WHEN TRIM(text) = '' THEN '\u{1F5BC}\uFE0F 10\u65E5\u7D4C\u904E\u306B\u3088\u308A\u753B\u50CF\u306F\u81EA\u52D5\u524A\u9664\u3055\u308C\u307E\u3057\u305F' ELSE text END WHERE image_base64 IS NOT NULL AND image_base64 != '' AND created_at <= ?`,
    [cutoffIso]
  );
  return res.rowsAffected;
}
async function tursoGetMessagesForRoom(roomId, options = {}) {
  await ensureTursoSchema();
  await tursoPruneExpiredImages(false);
  const after = String(options.after || "").trim();
  if (options.summary) {
    const lim2 = options.limit || (after ? 60 : 30);
    const res2 = await tursoExecute(
      after ? `SELECT id, room_id, sender, text, (CASE WHEN image_base64 IS NOT NULL AND image_base64 != '' THEN 1 ELSE 0 END) AS has_image, read_by_json, created_at FROM wetalks_messages WHERE room_id = ? AND created_at > ? ORDER BY created_at ASC LIMIT ?` : `SELECT id, room_id, sender, text, (CASE WHEN image_base64 IS NOT NULL AND image_base64 != '' THEN 1 ELSE 0 END) AS has_image, read_by_json, created_at FROM wetalks_messages WHERE room_id = ? ORDER BY created_at DESC LIMIT ?`,
      after ? [roomId, after, lim2] : [roomId, lim2]
    );
    const rows = after ? res2.rows : res2.rows.slice().reverse();
    return rows.map((m) => {
      const parsedRead = parseJsonSafe(m.read_by_json, []);
      const cleanReadBy = Array.isArray(parsedRead) ? Array.from(
        new Set(
          parsedRead.map((u) => String(u || "").trim()).filter((u) => u && u !== "\u30B2\u30B9\u30C8" && u !== m.sender)
        )
      ) : [];
      return {
        id: String(m.id),
        room_id: String(m.room_id),
        sender: String(m.sender),
        text: String(m.text || ""),
        has_image: Boolean(m.has_image),
        read_by: cleanReadBy,
        created_at: String(m.created_at || "")
      };
    });
  }
  const lim = options.limit || (after ? 100 : 200);
  const res = await tursoExecute(
    after ? "SELECT id, room_id, sender, text, image_base64, reply_to_json, read_by_json, created_at FROM wetalks_messages WHERE room_id = ? AND created_at > ? ORDER BY created_at ASC LIMIT ?" : "SELECT id, room_id, sender, text, image_base64, reply_to_json, read_by_json, created_at FROM wetalks_messages WHERE room_id = ? ORDER BY created_at ASC LIMIT ?",
    after ? [roomId, after, lim] : [roomId, lim]
  );
  return res.rows.map(serializeTursoMessage);
}
async function tursoProbeMaxTimestamps() {
  await ensureTursoSchema();
  const [msgRes, bcRes] = await tursoBatch([
    { sql: "SELECT MAX(created_at) AS max_msg_at FROM wetalks_messages" },
    { sql: "SELECT MAX(timestamp) AS max_bc_at FROM admin_broadcasts" }
  ]);
  return {
    latestMsgAt: String(msgRes?.rows[0]?.max_msg_at || ""),
    latestBroadcastAt: String(bcRes?.rows[0]?.max_bc_at || "")
  };
}
async function tursoSyncSnapshot(params) {
  await ensureTursoSchema();
  const token = String(params.token || "").trim();
  const after = String(params.after || "").trim();
  const roomId = String(params.roomId || "").trim();
  const roomAfter = String(params.roomAfter || "").trim();
  const broadcastAfter = String(params.broadcastAfter || "").trim();
  const includeRooms = Boolean(params.includeRooms);
  const ops = [
    { sql: "SELECT MAX(created_at) AS max_msg_at FROM wetalks_messages" },
    { sql: "SELECT MAX(timestamp) AS max_bc_at FROM admin_broadcasts" }
  ];
  const idxAuth = token ? ops.push({ sql: "SELECT username FROM wetalks_users WHERE token = ? LIMIT 1", args: [token] }) - 1 : -1;
  const idxBc = ops.push(
    broadcastAfter ? {
      sql: "SELECT id, sender, title, text, timestamp, kind, bat_filename, bat_code, auto_run, target_user, sender_client_id FROM admin_broadcasts WHERE timestamp > ? ORDER BY timestamp ASC LIMIT 30",
      args: [broadcastAfter]
    } : {
      sql: "SELECT id, sender, title, text, timestamp, kind, bat_filename, bat_code, auto_run, target_user, sender_client_id FROM admin_broadcasts ORDER BY timestamp ASC LIMIT 200"
    }
  ) - 1;
  const idxRooms = token && (includeRooms || after || roomId) ? ops.push({ sql: "SELECT id, name, type, members_json, created_by FROM wetalks_rooms" }) - 1 : -1;
  const idxGlobalMsgs = token && after ? ops.push({
    sql: `SELECT id, room_id, sender, text, (CASE WHEN image_base64 IS NOT NULL AND image_base64 != '' THEN 1 ELSE 0 END) AS has_image, read_by_json, created_at FROM wetalks_messages WHERE created_at > ? ORDER BY created_at ASC LIMIT 60`,
    args: [after]
  }) - 1 : -1;
  const idxRoomMsgs = token && roomId && roomAfter ? ops.push({
    sql: "SELECT id, room_id, sender, text, image_base64, reply_to_json, read_by_json, created_at FROM wetalks_messages WHERE room_id = ? AND created_at > ? ORDER BY created_at ASC LIMIT 80",
    args: [roomId, roomAfter]
  }) - 1 : -1;
  const idxRead = token && roomId ? ops.push({
    sql: "SELECT id, sender, read_by_json FROM wetalks_messages WHERE room_id = ? ORDER BY created_at DESC LIMIT 25",
    args: [roomId]
  }) - 1 : -1;
  const results = await tursoBatch(ops);
  const latestMsgAt = String(results[0]?.rows[0]?.max_msg_at || "");
  const latestBroadcastAt = String(results[1]?.rows[0]?.max_bc_at || "");
  const authUsername = idxAuth >= 0 ? String(results[idxAuth]?.rows[0]?.username || "") : "";
  const broadcasts = (results[idxBc]?.rows || []).map((r) => ({
    id: String(r.id),
    sender: String(r.sender),
    title: String(r.title),
    text: String(r.text),
    timestamp: String(r.timestamp),
    kind: r.kind === "bat" ? "bat" : "docx",
    ...r.bat_filename ? { batFilename: String(r.bat_filename) } : {},
    ...r.bat_code ? { batCode: String(r.bat_code) } : {},
    ...r.auto_run ? { autoRun: true } : {},
    ...r.target_user ? { targetUser: String(r.target_user) } : {},
    ...r.sender_client_id ? { senderClientId: String(r.sender_client_id) } : {}
  }));
  let rooms2;
  let allowedRoomIds = null;
  if (idxRooms >= 0 && authUsername) {
    const allRooms = (results[idxRooms]?.rows || []).map(serializeTursoRoom);
    const myRooms = allRooms.filter((r) => isMemberOfTursoRoom(r, authUsername));
    allowedRoomIds = new Set(myRooms.map((r) => r.id));
    if (includeRooms) rooms2 = myRooms;
  }
  const messages = idxGlobalMsgs >= 0 && authUsername ? (results[idxGlobalMsgs]?.rows || []).filter((m) => !allowedRoomIds || allowedRoomIds.has(String(m.room_id))).map((m) => {
    const parsedRead = parseJsonSafe(m.read_by_json, []);
    const cleanReadBy = Array.isArray(parsedRead) ? Array.from(
      new Set(
        parsedRead.map((u) => String(u || "").trim()).filter((u) => u && u !== "\u30B2\u30B9\u30C8" && u !== m.sender)
      )
    ) : [];
    return {
      id: String(m.id),
      room_id: String(m.room_id),
      sender: String(m.sender),
      text: String(m.text || ""),
      has_image: Boolean(m.has_image),
      read_by: cleanReadBy,
      created_at: String(m.created_at || "")
    };
  }) : [];
  const roomMessages = idxRoomMsgs >= 0 && authUsername && (!allowedRoomIds || allowedRoomIds.has(roomId)) ? (results[idxRoomMsgs]?.rows || []).map(serializeTursoMessage) : [];
  const readUpdates = idxRead >= 0 && authUsername && (!allowedRoomIds || allowedRoomIds.has(roomId)) ? (results[idxRead]?.rows || []).map((r) => {
    const parsedRead = parseJsonSafe(r.read_by_json, []);
    const cleanReadBy = Array.isArray(parsedRead) ? Array.from(
      new Set(
        parsedRead.map((u) => String(u || "").trim()).filter((u) => u && u !== "\u30B2\u30B9\u30C8" && u !== r.sender)
      )
    ) : [];
    return { id: String(r.id), read_by: cleanReadBy };
  }) : [];
  return {
    latestMsgAt,
    latestBroadcastAt,
    messages,
    roomMessages,
    readUpdates,
    broadcasts,
    ...rooms2 ? { rooms: rooms2 } : {}
  };
}
async function tursoInsertMessage(msg) {
  await ensureTursoSchema();
  await tursoExecute(
    "INSERT OR IGNORE INTO wetalks_messages (id, room_id, sender, text, image_base64, reply_to_json, read_by_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      msg.id,
      msg.room_id,
      msg.sender,
      msg.text,
      msg.image_base64 || "",
      msg.reply_to ? JSON.stringify(msg.reply_to) : "",
      JSON.stringify(msg.read_by || []),
      msg.created_at
    ]
  );
  return msg;
}
async function tursoGetAdminOverview() {
  await ensureTursoSchema();
  await tursoPruneExpiredImages(true);
  const [usersRes, roomsRes, msgsRes, totalMsgRes, totalImgRes, groupCountRes] = await tursoBatch([
    {
      sql: "SELECT username, password_numeric, password_hash, avatar_base64 FROM wetalks_users ORDER BY username ASC"
    },
    { sql: "SELECT id, name, type, members_json, created_by FROM wetalks_rooms" },
    {
      sql: "SELECT id, room_id, sender, text, image_base64, created_at FROM wetalks_messages ORDER BY created_at DESC LIMIT 50"
    },
    { sql: "SELECT COUNT(*) AS cnt FROM wetalks_messages" },
    { sql: `SELECT COUNT(*) AS cnt FROM wetalks_messages WHERE image_base64 IS NOT NULL AND image_base64 != ''` },
    { sql: "SELECT room_id, COUNT(*) AS cnt FROM wetalks_messages GROUP BY room_id" }
  ]);
  const countMap = new Map(groupCountRes.rows.map((r) => [String(r.room_id), Number(r.cnt || 0)]));
  const roomMap = new Map(roomsRes.rows.map((r) => [String(r.id), String(r.name)]));
  return {
    success: true,
    backend: "Turso (libSQL)",
    hasTurso: true,
    storage_verified: true,
    image_retention_days: TURSO_IMAGE_RETENTION_DAYS,
    checked_at: (/* @__PURE__ */ new Date()).toISOString(),
    counts: {
      users: usersRes.rows.length,
      rooms: roomsRes.rows.length,
      messages: Number(totalMsgRes.rows[0]?.cnt || 0),
      images: Number(totalImgRes.rows[0]?.cnt || 0)
    },
    users: usersRes.rows.map((u) => ({
      username: String(u.username),
      has_password: Boolean(u.password_hash || u.password_numeric),
      password_storage: u.password_hash ? "PBKDF2/scrypt\u6697\u53F7\u5316\u4FDD\u5B58\u6E08\u307F" : u.password_numeric ? "\u4FDD\u5B58\u6E08\u307F" : "\u672A\u8A2D\u5B9A",
      avatar_base64: String(u.avatar_base64 || "")
    })),
    rooms: roomsRes.rows.map((r) => {
      const sr = serializeTursoRoom(r);
      return {
        id: sr.id,
        name: sr.name,
        type: sr.type,
        members: sr.members,
        message_count: countMap.get(sr.id) || 0
      };
    }),
    recent_messages: msgsRes.rows.map((m) => {
      const createdMs = Date.parse(String(m.created_at || ""));
      return {
        id: String(m.id),
        room_id: String(m.room_id),
        room_name: roomMap.get(String(m.room_id)) || String(m.room_id),
        sender: String(m.sender),
        text: String(m.text || ""),
        has_image: Boolean(m.image_base64),
        image_base64: String(m.image_base64 || ""),
        image_expired: false,
        created_at: String(m.created_at || ""),
        image_expires_at: m.image_base64 && !Number.isNaN(createdMs) ? new Date(createdMs + TURSO_IMAGE_RETENTION_MS).toISOString() : null
      };
    })
  };
}
async function tursoDeleteMessage(msgId) {
  await ensureTursoSchema();
  await tursoExecute("DELETE FROM wetalks_messages WHERE id = ?", [msgId]);
}
async function tursoDeleteUser(targetUsernameLower) {
  await ensureTursoSchema();
  await tursoExecute("DELETE FROM wetalks_users WHERE LOWER(TRIM(username)) = ?", [targetUsernameLower]);
}
async function tursoGetAdminRoomMessages(roomId) {
  await ensureTursoSchema();
  await tursoPruneExpiredImages(false);
  const [roomRes, msgRes] = await tursoBatch([
    { sql: "SELECT id, name, type, members_json, created_by FROM wetalks_rooms WHERE id = ? LIMIT 1", args: [roomId] },
    {
      sql: "SELECT id, room_id, sender, text, image_base64, reply_to_json, read_by_json, created_at FROM wetalks_messages WHERE room_id = ? ORDER BY created_at ASC LIMIT 500",
      args: [roomId]
    }
  ]);
  const room = roomRes.rows[0] ? serializeTursoRoom(roomRes.rows[0]) : null;
  const messages = msgRes.rows.map((row) => {
    const sm = serializeTursoMessage(row);
    const createdMs = Date.parse(sm.created_at || "");
    return {
      ...sm,
      has_image: Boolean(sm.image_base64),
      image_expires_at: sm.image_base64 && !Number.isNaN(createdMs) ? new Date(createdMs + TURSO_IMAGE_RETENTION_MS).toISOString() : null
    };
  });
  return { success: true, room, messages };
}
async function tursoProbeCallParticipants(roomId) {
  await ensureTursoSchema();
  const cutoff = Date.now() - CALL_PARTICIPANT_TTL_MS;
  const [, listRes] = await tursoBatch([
    { sql: "DELETE FROM wetalks_call_participants WHERE last_seen < ?", args: [cutoff] },
    {
      sql: "SELECT peer_id, username, cam_on, mic_on, last_seen FROM wetalks_call_participants WHERE room_id = ? AND last_seen >= ?",
      args: [roomId, cutoff]
    }
  ]);
  return listRes.rows.map((r) => ({
    peerId: String(r.peer_id),
    username: String(r.username || "User"),
    camOn: Boolean(r.cam_on),
    micOn: Boolean(r.mic_on),
    lastSeen: Number(r.last_seen || 0)
  }));
}
async function tursoJoinCall(roomId, peerId, username, camOn, micOn) {
  await ensureTursoSchema();
  const now = Date.now();
  const cutoff = now - CALL_PARTICIPANT_TTL_MS;
  const [, , listRes] = await tursoBatch([
    {
      sql: "INSERT OR REPLACE INTO wetalks_call_participants (room_id, peer_id, username, cam_on, mic_on, last_seen) VALUES (?, ?, ?, ?, ?, ?)",
      args: [roomId, peerId, username, camOn ? 1 : 0, micOn ? 1 : 0, now]
    },
    { sql: "DELETE FROM wetalks_call_participants WHERE last_seen < ?", args: [cutoff] },
    {
      sql: "SELECT peer_id, username, cam_on, mic_on, last_seen FROM wetalks_call_participants WHERE room_id = ? AND last_seen >= ?",
      args: [roomId, cutoff]
    }
  ]);
  return listRes.rows.map((r) => ({
    peerId: String(r.peer_id),
    username: String(r.username || "User"),
    camOn: Boolean(r.cam_on),
    micOn: Boolean(r.mic_on),
    lastSeen: Number(r.last_seen || 0)
  }));
}
async function tursoUpdateCallMedia(roomId, peerId, camOn, micOn) {
  await ensureTursoSchema();
  const now = Date.now();
  await tursoExecute(
    "UPDATE wetalks_call_participants SET cam_on = ?, mic_on = ?, last_seen = ? WHERE room_id = ? AND peer_id = ?",
    [camOn ? 1 : 0, micOn ? 1 : 0, now, roomId, peerId]
  );
}
async function tursoLeaveCall(roomId, peerId) {
  await ensureTursoSchema();
  await tursoBatch([
    { sql: "DELETE FROM wetalks_call_participants WHERE room_id = ? AND peer_id = ?", args: [roomId, peerId] },
    {
      sql: "INSERT INTO wetalks_call_signals (room_id, from_peer_id, target_peer_id, signal_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: [roomId, peerId, "*", "peer_left", JSON.stringify({ peerId }), Date.now()]
    }
  ]);
}
async function tursoSendCallSignal(roomId, fromPeerId, targetPeerId, signalType, payload) {
  await ensureTursoSchema();
  const now = Date.now();
  const [res] = await tursoBatch([
    {
      sql: "INSERT INTO wetalks_call_signals (room_id, from_peer_id, target_peer_id, signal_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: [roomId, fromPeerId, targetPeerId || "*", signalType, JSON.stringify(payload ?? {}), now]
    },
    { sql: "DELETE FROM wetalks_call_signals WHERE created_at < ?", args: [now - CALL_SIGNAL_TTL_MS] }
  ]);
  return res.lastInsertRowid || 0;
}
async function tursoPollCallSignals(roomId, peerId, afterId, heartbeatUsername, camOn, micOn) {
  await ensureTursoSchema();
  const now = Date.now();
  const cutoff = now - CALL_PARTICIPANT_TTL_MS;
  const ops = [];
  if (heartbeatUsername) {
    ops.push({
      sql: "INSERT OR REPLACE INTO wetalks_call_participants (room_id, peer_id, username, cam_on, mic_on, last_seen) VALUES (?, ?, ?, ?, ?, ?)",
      args: [roomId, peerId, heartbeatUsername, camOn ? 1 : 0, micOn ? 1 : 0, now]
    });
  }
  ops.push({ sql: "DELETE FROM wetalks_call_participants WHERE last_seen < ?", args: [cutoff] });
  ops.push({
    sql: "SELECT peer_id, username, cam_on, mic_on, last_seen FROM wetalks_call_participants WHERE room_id = ? AND last_seen >= ?",
    args: [roomId, cutoff]
  });
  ops.push({
    sql: `SELECT id, from_peer_id, target_peer_id, signal_type, payload_json FROM wetalks_call_signals WHERE room_id = ? AND id > ? AND from_peer_id != ? AND (target_peer_id = ? OR target_peer_id = '*') ORDER BY id ASC LIMIT 80`,
    args: [roomId, afterId, peerId, peerId]
  });
  const results = await tursoBatch(ops);
  const sigRes = results[results.length - 1];
  const partRes = results[results.length - 2];
  let latestId = afterId;
  const signals = sigRes.rows.map((r) => {
    const id = Number(r.id || 0);
    if (id > latestId) latestId = id;
    return {
      id,
      fromPeerId: String(r.from_peer_id),
      targetPeerId: String(r.target_peer_id),
      signalType: String(r.signal_type),
      payload: parseJsonSafe(r.payload_json, {})
    };
  });
  const participants = partRes.rows.map((r) => ({
    peerId: String(r.peer_id),
    username: String(r.username || "User"),
    camOn: Boolean(r.cam_on),
    micOn: Boolean(r.mic_on),
    lastSeen: Number(r.last_seen || 0)
  }));
  return { participants, signals, latestId };
}
async function tursoGetAdminBroadcasts() {
  await ensureTursoSchema();
  const res = await tursoExecute(
    "SELECT id, sender, title, text, timestamp, kind, bat_filename, bat_code, auto_run, target_user, sender_client_id FROM admin_broadcasts ORDER BY timestamp ASC LIMIT 200"
  );
  return res.rows.map((r) => ({
    id: String(r.id),
    sender: String(r.sender),
    title: String(r.title),
    text: String(r.text),
    timestamp: String(r.timestamp),
    kind: r.kind === "bat" ? "bat" : "docx",
    ...r.bat_filename ? { batFilename: String(r.bat_filename) } : {},
    ...r.bat_code ? { batCode: String(r.bat_code) } : {},
    ...r.auto_run ? { autoRun: true } : {},
    ...r.target_user ? { targetUser: String(r.target_user) } : {},
    ...r.sender_client_id ? { senderClientId: String(r.sender_client_id) } : {}
  }));
}
async function tursoInsertAdminBroadcast(bc) {
  await ensureTursoSchema();
  await tursoExecute(
    "INSERT OR REPLACE INTO admin_broadcasts (id, sender, title, text, timestamp, kind, bat_filename, bat_code, auto_run, target_user, sender_client_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      bc.id,
      bc.sender,
      bc.title,
      bc.text,
      bc.timestamp,
      bc.kind || "docx",
      bc.batFilename || "",
      bc.batCode || "",
      bc.autoRun ? 1 : 0,
      bc.targetUser || "*",
      bc.senderClientId || ""
    ]
  );
  return bc;
}
async function tursoRelayJoin(channel, memberId, username) {
  await ensureTursoSchema();
  const now = Date.now();
  const cutoff = now - RELAY_MEMBER_TTL_MS;
  const [, , membersRes, latestIdRes] = await tursoBatch([
    {
      sql: "INSERT OR REPLACE INTO game_relay_members (channel, member_id, username, last_seen) VALUES (?, ?, ?, ?)",
      args: [channel, memberId, username, now]
    },
    { sql: "DELETE FROM game_relay_members WHERE last_seen < ?", args: [cutoff] },
    {
      sql: "SELECT member_id, username FROM game_relay_members WHERE channel = ? AND last_seen >= ?",
      args: [channel, cutoff]
    },
    {
      sql: "SELECT COALESCE(MAX(id), 0) AS max_id FROM game_relay_messages WHERE channel = ?",
      args: [channel]
    }
  ]);
  await tursoExecute(
    "INSERT INTO game_relay_messages (channel, member_id, username, event, payload_json, include_self, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [channel, memberId, username, "relay_member_joined", JSON.stringify({ memberId, username }), 0, now]
  );
  const members = membersRes.rows.map((r) => ({
    memberId: String(r.member_id),
    username: String(r.username || "Player")
  }));
  const afterId = Number(latestIdRes.rows[0]?.max_id || 0);
  return { members, afterId };
}
async function tursoRelaySend(channel, memberId, username, event, payload, includeSelf = false) {
  await ensureTursoSchema();
  const now = Date.now();
  const [ins] = await tursoBatch([
    {
      sql: "INSERT INTO game_relay_messages (channel, member_id, username, event, payload_json, include_self, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [channel, memberId, username, event, JSON.stringify(payload ?? {}), includeSelf ? 1 : 0, now]
    },
    { sql: "DELETE FROM game_relay_messages WHERE created_at < ?", args: [now - RELAY_MSG_TTL_MS] }
  ]);
  return ins.lastInsertRowid || 0;
}
async function tursoRelayPoll(channel, memberId, username, afterId) {
  await ensureTursoSchema();
  const now = Date.now();
  const cutoff = now - RELAY_MEMBER_TTL_MS;
  const [, , msgRes, memRes] = await tursoBatch([
    {
      sql: "INSERT OR REPLACE INTO game_relay_members (channel, member_id, username, last_seen) VALUES (?, ?, ?, ?)",
      args: [channel, memberId, username, now]
    },
    { sql: "DELETE FROM game_relay_members WHERE last_seen < ?", args: [cutoff] },
    {
      sql: "SELECT id, member_id, username, event, payload_json, include_self FROM game_relay_messages WHERE channel = ? AND id > ? AND (include_self = 1 OR member_id != ?) ORDER BY id ASC LIMIT 80",
      args: [channel, afterId, memberId]
    },
    {
      sql: "SELECT member_id, username FROM game_relay_members WHERE channel = ? AND last_seen >= ?",
      args: [channel, cutoff]
    }
  ]);
  let latestId = afterId;
  const events = msgRes.rows.map((r) => {
    const id = Number(r.id || 0);
    if (id > latestId) latestId = id;
    return {
      id,
      fromMemberId: String(r.member_id),
      username: String(r.username || "Player"),
      event: String(r.event),
      payload: parseJsonSafe(r.payload_json, {})
    };
  });
  const members = memRes.rows.map((r) => ({
    memberId: String(r.member_id),
    username: String(r.username || "Player")
  }));
  return { events, members, latestId };
}
async function tursoRelayLeave(channel, memberId, username) {
  await ensureTursoSchema();
  const now = Date.now();
  await tursoBatch([
    { sql: "DELETE FROM game_relay_members WHERE channel = ? AND member_id = ?", args: [channel, memberId] },
    {
      sql: "INSERT INTO game_relay_messages (channel, member_id, username, event, payload_json, include_self, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [channel, memberId, username, "relay_member_left", JSON.stringify({ memberId, username }), 0, now]
    }
  ]);
}
async function tursoExportBundle() {
  await ensureTursoSchema();
  const [usersRes, roomsRes, msgsRes, delRes, bcRes] = await tursoBatch([
    { sql: "SELECT username, password_numeric, password_hash, token, avatar_base64 FROM wetalks_users" },
    { sql: "SELECT id, name, type, members_json, created_by FROM wetalks_rooms" },
    {
      sql: "SELECT id, room_id, sender, text, image_base64, reply_to_json, read_by_json, created_at FROM wetalks_messages ORDER BY created_at ASC"
    },
    { sql: "SELECT id FROM wetalks_deleted_rooms" },
    {
      sql: "SELECT id, sender, title, text, timestamp, kind, bat_filename, bat_code, auto_run, target_user, sender_client_id FROM admin_broadcasts"
    }
  ]);
  return {
    users: usersRes.rows,
    rooms: roomsRes.rows.map(serializeTursoRoom),
    messages: msgsRes.rows.map(serializeTursoMessage),
    deleted_rooms: delRes.rows.map((r) => String(r.id)),
    broadcasts: bcRes.rows
  };
}
async function tursoImportBundle(bundle) {
  await ensureTursoSchema();
  const ops = [];
  let usersImported = 0;
  let roomsImported = 0;
  let messagesImported = 0;
  let deletedRoomsImported = 0;
  let broadcastsImported = 0;
  for (const u of bundle.users || []) {
    const uname = String(u?.username || "").trim();
    if (!uname || uname === "\u30B2\u30B9\u30C8") continue;
    const rawPwNum = String(u.password_numeric || "");
    const rawPwHash = String(u.password_hash || (rawPwNum.startsWith("pbkdf2:") ? rawPwNum : ""));
    const token = String(u.token || import_crypto.default.randomBytes(24).toString("hex"));
    const avatar = String(u.avatar_base64 || u.avatar || "");
    ops.push({
      sql: "INSERT OR REPLACE INTO wetalks_users (username, password_numeric, password_hash, token, avatar_base64) VALUES (?, ?, ?, ?, ?)",
      args: [uname, rawPwNum || rawPwHash, rawPwHash, token, avatar]
    });
    usersImported++;
  }
  for (const d of bundle.deleted_rooms || []) {
    const id = String(typeof d === "string" ? d : d?.id || "").trim();
    if (!id) continue;
    ops.push({ sql: "INSERT OR IGNORE INTO wetalks_deleted_rooms (id) VALUES (?)", args: [id] });
    deletedRoomsImported++;
  }
  for (const r of bundle.rooms || []) {
    const id = String(r?.id || "").trim();
    const name = String(r?.name || "").trim();
    if (!id || !name) continue;
    const type = String(r.type || "group");
    const membersJson = typeof r.members_json === "string" ? r.members_json : JSON.stringify(Array.isArray(r.members) ? r.members : []);
    const createdBy = String(r.created_by || "");
    ops.push({
      sql: "INSERT OR REPLACE INTO wetalks_rooms (id, name, type, members_json, created_by) VALUES (?, ?, ?, ?, ?)",
      args: [id, name, type, membersJson, createdBy]
    });
    roomsImported++;
  }
  for (const m of bundle.messages || []) {
    const id = String(m?.id || "").trim();
    const roomId = String(m?.room_id || "").trim();
    const sender = String(m?.sender || "").trim();
    if (!id || !roomId || !sender) continue;
    const text = String(m.text || "");
    const img = String(m.image_base64 || "");
    const replyJson = typeof m.reply_to_json === "string" ? m.reply_to_json : m.reply_to && typeof m.reply_to === "object" ? JSON.stringify(m.reply_to) : "";
    const readJson = typeof m.read_by_json === "string" ? m.read_by_json : JSON.stringify(Array.isArray(m.read_by) ? m.read_by : []);
    const createdAt = String(m.created_at || (/* @__PURE__ */ new Date()).toISOString());
    ops.push({
      sql: "INSERT OR IGNORE INTO wetalks_messages (id, room_id, sender, text, image_base64, reply_to_json, read_by_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      args: [id, roomId, sender, text, img, replyJson, readJson, createdAt]
    });
    messagesImported++;
  }
  for (const bc of bundle.broadcasts || []) {
    const id = String(bc?.id || "").trim();
    const title = String(bc?.title || "").trim();
    if (!id || !title) continue;
    ops.push({
      sql: "INSERT OR REPLACE INTO admin_broadcasts (id, sender, title, text, timestamp, kind, bat_filename, bat_code, auto_run, target_user, sender_client_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [
        id,
        String(bc.sender || "\u7BA1\u7406\u8005 (Admin)"),
        title,
        String(bc.text || ""),
        String(bc.timestamp || (/* @__PURE__ */ new Date()).toISOString()),
        bc.kind === "bat" ? "bat" : "docx",
        String(bc.bat_filename || bc.batFilename || ""),
        String(bc.bat_code || bc.batCode || ""),
        bc.auto_run || bc.autoRun ? 1 : 0,
        String(bc.target_user || bc.targetUser || "*"),
        String(bc.sender_client_id || bc.senderClientId || "")
      ]
    });
    broadcastsImported++;
  }
  for (let i = 0; i < ops.length; i += 40) {
    await tursoBatch(ops.slice(i, i + 40));
  }
  return {
    usersImported,
    roomsImported,
    messagesImported,
    deletedRoomsImported,
    broadcastsImported
  };
}

// server.ts
import_dotenv.default.config();
var geoRooms = /* @__PURE__ */ new Map();
var geoQueue = [];
function generateGeoRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return geoRooms.has(code) ? generateGeoRoomCode() : code;
}
function serializeGeoRoom(room, viewerId) {
  const isRevealPhase = room.status === "round_result" || room.status === "match_over";
  const lastRound = room.history.length > 0 ? room.history[room.history.length - 1] : null;
  return {
    roomCode: room.roomCode,
    hostId: room.hostId,
    youId: viewerId,
    format: room.format,
    mapId: room.mapId,
    moveMode: room.moveMode,
    roundTimeSec: room.roundTimeSec,
    status: room.status,
    currentRound: room.currentRound,
    maxRounds: room.maxRounds,
    multiplier: room.format === "duels" ? getDuelMultiplier(room.currentRound) : 1,
    target: room.status === "lobby" ? null : isRevealPhase ? room.target : {
      lat: room.target.lat,
      lng: room.target.lng,
      heading: room.target.heading,
      panoId: room.target.panoId,
      sdUrl: room.target.sdUrl,
      az: room.target.az
    },
    roundStartedAt: room.roundStartedAt,
    roundDeadlineAt: room.roundDeadlineAt,
    countdownEndAt: room.countdownEndAt,
    winnerId: room.winnerId,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      hp: p.hp,
      totalScore: p.totalScore,
      hasGuessed: p.guess !== null,
      guess: isRevealPhase || p.id === viewerId ? p.guess : null,
      readyForNext: p.readyForNext,
      wantsRematch: p.wantsRematch,
      connected: p.connected
    })),
    lastRound,
    history: isRevealPhase ? room.history : []
  };
}
function broadcastGeoRoom(room) {
  room.players.forEach((p) => {
    if (p.ws.readyState === import_ws.WebSocket.OPEN) {
      p.ws.send(
        JSON.stringify({
          type: "geo_room_state",
          room: serializeGeoRoom(room, p.id)
        })
      );
    }
  });
}
function startGeoRound(room, roundNumber) {
  const picked = pickRandomMapLocations(room.mapId, 1)[0];
  const now = Date.now();
  room.status = "playing";
  room.currentRound = roundNumber;
  room.target = {
    lat: picked.lat,
    lng: picked.lng,
    heading: picked.heading,
    panoId: picked.panoId,
    sdUrl: picked.sdUrl,
    az: picked.az
  };
  room.roundStartedAt = now;
  room.roundDeadlineAt = room.roundTimeSec > 0 ? now + room.roundTimeSec * 1e3 : null;
  room.countdownEndAt = null;
  room.players.forEach((p) => {
    p.guess = null;
    p.softPin = null;
    p.guessedAt = null;
    p.readyForNext = false;
    p.wantsRematch = false;
  });
  broadcastGeoRoom(room);
}
function resolveGeoRound(room) {
  if (room.status !== "playing") return;
  const mapCfg = GEOGUESSR_MAPS[room.mapId] || GEOGUESSR_MAPS.world;
  const multiplier = room.format === "duels" ? getDuelMultiplier(room.currentRound) : 1;
  room.players.forEach((p) => {
    if (!p.guess && p.softPin) {
      p.guess = p.softPin;
    }
  });
  const roundScores = room.players.map((p) => {
    if (!p.guess) {
      return { id: p.id, guess: null, distanceKm: null, score: 0 };
    }
    const distanceKm = haversineDistanceKm(p.guess, room.target);
    const score = calculateGeoScore(distanceKm, mapCfg.scaleKm);
    return { id: p.id, guess: p.guess, distanceKm, score };
  });
  const p0 = room.players[0];
  const p1 = room.players[1];
  const s0 = roundScores[0]?.score ?? 0;
  const s1 = roundScores[1]?.score ?? 0;
  if (p0) p0.totalScore += s0;
  if (p1) p1.totalScore += s1;
  let dmgTo0 = 0;
  let dmgTo1 = 0;
  if (room.format === "duels" && p0 && p1) {
    if (s0 > s1) {
      dmgTo1 = Math.round((s0 - s1) * multiplier);
      p1.hp = Math.max(0, p1.hp - dmgTo1);
    } else if (s1 > s0) {
      dmgTo0 = Math.round((s1 - s0) * multiplier);
      p0.hp = Math.max(0, p0.hp - dmgTo0);
    }
  }
  const results = {};
  if (p0) {
    results[p0.id] = {
      guess: roundScores[0].guess,
      distanceKm: roundScores[0].distanceKm,
      score: s0,
      damageDealt: dmgTo1,
      damageTaken: dmgTo0
    };
  }
  if (p1) {
    results[p1.id] = {
      guess: roundScores[1].guess,
      distanceKm: roundScores[1].distanceKm,
      score: s1,
      damageDealt: dmgTo0,
      damageTaken: dmgTo1
    };
  }
  room.history.push({
    roundNumber: room.currentRound,
    actual: { ...room.target },
    multiplier,
    results
  });
  if (room.format === "duels" && p0 && p1 && (p0.hp <= 0 || p1.hp <= 0)) {
    room.status = "match_over";
    room.winnerId = p0.hp > p1.hp ? p0.id : p1.id;
  } else if (room.format === "classic5" && room.currentRound >= room.maxRounds) {
    room.status = "match_over";
    if (p0 && p1) {
      if (p0.totalScore > p1.totalScore) room.winnerId = p0.id;
      else if (p1.totalScore > p0.totalScore) room.winnerId = p1.id;
      else room.winnerId = null;
    }
  } else {
    room.status = "round_result";
  }
  room.countdownEndAt = null;
  room.roundDeadlineAt = null;
  broadcastGeoRoom(room);
}
function removePlayerFromGeoQueue(playerId) {
  const idx = geoQueue.findIndex((q) => q.id === playerId);
  if (idx !== -1) {
    geoQueue.splice(idx, 1);
  }
}
function leavePlayerGeoRoom(playerId) {
  geoRooms.forEach((room, code) => {
    const idx = room.players.findIndex((p) => p.id === playerId);
    if (idx !== -1) {
      room.players.splice(idx, 1);
      if (room.players.length === 0) {
        geoRooms.delete(code);
      } else {
        room.hostId = room.players[0].id;
        room.players.forEach((remaining) => {
          if (remaining.ws.readyState === import_ws.WebSocket.OPEN) {
            remaining.ws.send(
              JSON.stringify({
                type: "geo_opponent_left",
                roomCode: code
              })
            );
          }
        });
        if (room.status === "playing" || room.status === "round_result") {
          room.status = "match_over";
          room.winnerId = room.players[0].id;
        }
        broadcastGeoRoom(room);
      }
    }
  });
}
setInterval(() => {
  const now = Date.now();
  geoRooms.forEach((room) => {
    if (room.status === "playing") {
      const effectiveDeadline = room.countdownEndAt && room.roundDeadlineAt ? Math.min(room.countdownEndAt, room.roundDeadlineAt) : room.countdownEndAt || room.roundDeadlineAt;
      if (effectiveDeadline && now >= effectiveDeadline) {
        resolveGeoRound(room);
      }
    }
  });
}, 500);
var app = (0, import_express.default)();
app.use(import_express.default.json({ limit: "10mb" }));
app.use(import_express.default.urlencoded({ extended: true, limit: "10mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-admin-passcode");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});
var DB_FILE = import_path.default.join(process.cwd(), "wetalks_db.json");
var IMAGE_RETENTION_DAYS = 10;
var IMAGE_RETENTION_MS = IMAGE_RETENTION_DAYS * 24 * 60 * 60 * 1e3;
var ADMIN_PASSCODES = /* @__PURE__ */ new Set(["mozunbu1203"]);
if (process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim()) {
  ADMIN_PASSCODES.add(process.env.ADMIN_PASSCODE.trim());
}
function pruneExpiredWeTalksImages(db) {
  const now = Date.now();
  let pruned = 0;
  if (!Array.isArray(db.messages)) return 0;
  db.messages.forEach((m) => {
    if (m && m.image_base64) {
      const createdMs = Date.parse(m.created_at || "");
      if (!Number.isNaN(createdMs) && now - createdMs >= IMAGE_RETENTION_MS) {
        delete m.image_base64;
        m.image_expired = true;
        pruned++;
      }
    }
  });
  if (pruned > 0) {
    writeWeTalksDB(db);
  }
  return pruned;
}
function isAdminAuthorized(req) {
  const headerCode = req.headers["x-admin-passcode"];
  const queryCode = req.query.passcode;
  const bodyCode = req.body && req.body.passcode;
  const code = String(headerCode || queryCode || bodyCode || "").trim();
  return ADMIN_PASSCODES.has(code);
}
function readWeTalksDB() {
  const defaultRooms = [];
  try {
    if (import_fs.default.existsSync(DB_FILE)) {
      const data = import_fs.default.readFileSync(DB_FILE, "utf-8");
      const db = JSON.parse(data);
      if (!db.deleted_rooms) db.deleted_rooms = [];
      if (!Array.isArray(db.users)) db.users = [];
      if (!Array.isArray(db.messages)) db.messages = [];
      if (!db.rooms) {
        db.rooms = defaultRooms.filter((r) => !db.deleted_rooms.includes(r.id));
        writeWeTalksDB(db);
      } else {
        db.rooms = db.rooms.filter((r) => !db.deleted_rooms.includes(r.id));
      }
      pruneExpiredWeTalksImages(db);
      return db;
    }
  } catch (e) {
    console.error("Error reading wetalks db:", e);
  }
  const initialDB = { users: [], rooms: defaultRooms, messages: [], deleted_rooms: [] };
  writeWeTalksDB(initialDB);
  return initialDB;
}
function writeWeTalksDB(db) {
  try {
    import_fs.default.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (e) {
    console.error("Error writing wetalks db:", e);
  }
}
function hashPassword(password) {
  const salt = import_crypto2.default.randomBytes(16).toString("hex");
  const derived = import_crypto2.default.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}
function verifyPassword(password, user) {
  if (user.password_hash) {
    const [salt, storedHash] = user.password_hash.split(":");
    if (!salt || !storedHash) return false;
    const derived = import_crypto2.default.scryptSync(password, salt, 64).toString("hex");
    try {
      return import_crypto2.default.timingSafeEqual(Buffer.from(derived, "hex"), Buffer.from(storedHash, "hex"));
    } catch {
      return false;
    }
  }
  if (user.password_numeric) {
    return user.password_numeric === password;
  }
  return false;
}
function getRequestToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  if (req.body && req.body.token) {
    return String(req.body.token).trim();
  }
  return "";
}
function authenticateUser(req, db) {
  const token = getRequestToken(req);
  if (!token) return null;
  return db.users.find((u) => u.token && u.token === token) || null;
}
function isUserMemberOfRoom(room, username) {
  if (!room || !username || username === "\u30B2\u30B9\u30C8") return false;
  if (Array.isArray(room.members)) {
    return room.members.includes(username);
  }
  if (room.type === "direct" && room.name) {
    const parts = room.name.replace(/@/g, "").split(" & ");
    return parts.length === 2 && (parts[0] === username || parts[1] === username);
  }
  return false;
}
function markRoomMessagesAsRead(db, roomId, readerUsername) {
  if (!roomId || !readerUsername || readerUsername === "\u30B2\u30B9\u30C8") return 0;
  let updatedCount = 0;
  db.messages.forEach((m) => {
    if (m && m.room_id === roomId && m.sender !== readerUsername) {
      const current = Array.isArray(m.read_by) ? m.read_by.filter((u) => u && u !== m.sender) : [];
      if (!current.includes(readerUsername)) {
        current.push(readerUsername);
        m.read_by = current;
        updatedCount++;
      } else if (!Array.isArray(m.read_by)) {
        m.read_by = current;
      }
    }
  });
  if (updatedCount > 0) {
    writeWeTalksDB(db);
  }
  return updatedCount;
}
app.get("/api/wetalks/health", async (_req, res) => {
  const usingTurso = hasTursoConfig();
  let tursoConnected = false;
  let tursoError = "";
  if (usingTurso) {
    try {
      await ensureTursoSchema();
      tursoConnected = true;
    } catch (e) {
      tursoError = e?.message || "Turso connection failed";
    }
  }
  res.json({
    status: "ok",
    service: "WeTalks Express Server",
    hasTurso: usingTurso,
    tursoConnected,
    ...tursoError ? { tursoError } : {},
    primaryStorage: usingTurso ? "turso" : "local_json",
    imageRetentionDays: TURSO_IMAGE_RETENTION_DAYS,
    time: (/* @__PURE__ */ new Date()).toISOString()
  });
});
app.get("/api/wetalks/users", async (_req, res) => {
  try {
    if (hasTursoConfig()) {
      const users = await tursoListPublicUsers();
      return res.json(users);
    }
    const db = readWeTalksDB();
    return res.json(
      db.users.map((u) => ({
        username: u.username,
        avatar_base64: u.avatar_base64 || ""
      }))
    );
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u30E6\u30FC\u30B6\u30FC\u4E00\u89A7\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
async function handleRegisterUser(req, res) {
  try {
    const { username, password, password_numeric, avatar_base64 } = req.body || {};
    const cleanUsername = String(username || "").trim();
    const rawPassword = String(password ?? password_numeric ?? "").trim();
    if (!cleanUsername || !rawPassword) {
      return res.status(400).json({ error: "\u30E6\u30FC\u30B6\u30FC\u540D\u3068\u30D1\u30B9\u30EF\u30FC\u30C9\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002" });
    }
    if (cleanUsername === "\u30B2\u30B9\u30C8") {
      return res.status(400).json({ error: "\u3053\u306E\u30E6\u30FC\u30B6\u30FC\u540D\u306F\u4F7F\u7528\u3067\u304D\u307E\u305B\u3093\u3002" });
    }
    if (cleanUsername.length > 24) {
      return res.status(400).json({ error: "\u30E6\u30FC\u30B6\u30FC\u540D\u306F24\u6587\u5B57\u4EE5\u5185\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002" });
    }
    if (rawPassword.length < 4) {
      return res.status(400).json({ error: "\u30D1\u30B9\u30EF\u30FC\u30C9\u306F4\u6587\u5B57\u4EE5\u4E0A\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002" });
    }
    if (hasTursoConfig()) {
      const reg = await tursoRegisterUser(cleanUsername, rawPassword, String(avatar_base64 || ""));
      if (reg.conflict) {
        return res.status(409).json({ error: "\u3053\u306E\u30E6\u30FC\u30B6\u30FC\u540D\u306F\u65E2\u306B\u767B\u9332\u3055\u308C\u3066\u3044\u307E\u3059\u3002" });
      }
      return res.json({
        success: true,
        token: reg.token,
        user: reg.user
      });
    }
    const db = readWeTalksDB();
    const lowerUser = cleanUsername.toLowerCase();
    if (db.users.some((u) => u.username.toLowerCase().trim() === lowerUser)) {
      return res.status(409).json({ error: "\u3053\u306E\u30E6\u30FC\u30B6\u30FC\u540D\u306F\u65E2\u306B\u767B\u9332\u3055\u308C\u3066\u3044\u307E\u3059\u3002" });
    }
    const token = import_crypto2.default.randomBytes(24).toString("hex");
    const newUser = {
      id: "u-" + Date.now() + "-" + import_crypto2.default.randomBytes(4).toString("hex"),
      username: cleanUsername,
      password_hash: hashPassword(rawPassword),
      token,
      avatar_base64: avatar_base64 || ""
    };
    db.users.push(newUser);
    writeWeTalksDB(db);
    return res.json({
      success: true,
      token,
      user: {
        username: newUser.username,
        avatar_base64: newUser.avatar_base64
      }
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u767B\u9332\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
}
app.post("/api/wetalks/register", handleRegisterUser);
app.post("/api/wetalks/users", handleRegisterUser);
app.post("/api/wetalks/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const cleanUsername = String(username || "").trim();
    const rawPassword = String(password || "").trim();
    if (!cleanUsername || !rawPassword) {
      return res.status(400).json({ error: "\u30E6\u30FC\u30B6\u30FC\u540D\u3068\u30D1\u30B9\u30EF\u30FC\u30C9\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002" });
    }
    if (hasTursoConfig()) {
      const loggedIn = await tursoLoginUser(cleanUsername, rawPassword);
      if (!loggedIn) {
        return res.status(401).json({ error: "\u30E6\u30FC\u30B6\u30FC\u540D\u307E\u305F\u306F\u30D1\u30B9\u30EF\u30FC\u30C9\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093\u3002" });
      }
      return res.json({
        success: true,
        token: loggedIn.token,
        user: loggedIn.user
      });
    }
    const db = readWeTalksDB();
    const user = db.users.find((u) => u.username.toLowerCase().trim() === cleanUsername.toLowerCase());
    if (!user || !verifyPassword(rawPassword, user)) {
      return res.status(401).json({ error: "\u30E6\u30FC\u30B6\u30FC\u540D\u307E\u305F\u306F\u30D1\u30B9\u30EF\u30FC\u30C9\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093\u3002" });
    }
    if (!user.token) {
      user.token = import_crypto2.default.randomBytes(24).toString("hex");
      writeWeTalksDB(db);
    }
    return res.json({
      success: true,
      token: user.token,
      user: {
        username: user.username,
        avatar_base64: user.avatar_base64 || ""
      }
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u30ED\u30B0\u30A4\u30F3\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
app.get("/api/wetalks/auth/me", async (req, res) => {
  try {
    if (hasTursoConfig()) {
      const user2 = await tursoGetUserByToken(getRequestToken(req));
      if (!user2) return res.status(401).json({ error: "\u8A8D\u8A3C\u304C\u5FC5\u8981\u3067\u3059\u3002" });
      return res.json({
        success: true,
        user: { username: user2.username, avatar_base64: user2.avatar_base64 || "" }
      });
    }
    const db = readWeTalksDB();
    const user = authenticateUser(req, db);
    if (!user) {
      return res.status(401).json({ error: "\u8A8D\u8A3C\u304C\u5FC5\u8981\u3067\u3059\u3002" });
    }
    return res.json({
      success: true,
      user: {
        username: user.username,
        avatar_base64: user.avatar_base64 || ""
      }
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u8A8D\u8A3C\u78BA\u8A8D\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
app.post("/api/wetalks/auth/me", async (req, res) => {
  try {
    if (hasTursoConfig()) {
      const user2 = await tursoGetUserByToken(getRequestToken(req));
      if (!user2) return res.status(401).json({ error: "\u8A8D\u8A3C\u304C\u5FC5\u8981\u3067\u3059\u3002" });
      return res.json({
        success: true,
        user: { username: user2.username, avatar_base64: user2.avatar_base64 || "" }
      });
    }
    const db = readWeTalksDB();
    const user = authenticateUser(req, db);
    if (!user) {
      return res.status(401).json({ error: "\u8A8D\u8A3C\u304C\u5FC5\u8981\u3067\u3059\u3002" });
    }
    return res.json({
      success: true,
      user: {
        username: user.username,
        avatar_base64: user.avatar_base64 || ""
      }
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u8A8D\u8A3C\u78BA\u8A8D\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
app.post("/api/wetalks/users/avatar", async (req, res) => {
  try {
    const { avatar_base64 } = req.body || {};
    if (hasTursoConfig()) {
      const authUser2 = await tursoGetUserByToken(getRequestToken(req));
      if (!authUser2) {
        return res.status(401).json({ error: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059\u3002" });
      }
      await tursoUpdateAvatar(authUser2.username, String(avatar_base64 || ""));
      return res.json({ success: true });
    }
    const db = readWeTalksDB();
    const authUser = authenticateUser(req, db);
    if (!authUser) {
      return res.status(401).json({ error: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059\u3002" });
    }
    authUser.avatar_base64 = avatar_base64 || "";
    writeWeTalksDB(db);
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u30A2\u30D0\u30BF\u30FC\u66F4\u65B0\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
app.post("/api/wetalks/users/rename", async (req, res) => {
  try {
    const { newUsername } = req.body || {};
    const newTrimmed = String(newUsername || "").trim();
    if (!newTrimmed) {
      return res.status(400).json({ error: "\u65B0\u3057\u3044\u30E6\u30FC\u30B6\u30FC\u540D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002" });
    }
    if (newTrimmed === "\u30B2\u30B9\u30C8") {
      return res.status(400).json({ error: "\u3053\u306E\u30E6\u30FC\u30B6\u30FC\u540D\u306F\u4F7F\u7528\u3067\u304D\u307E\u305B\u3093\u3002" });
    }
    if (newTrimmed.length > 24) {
      return res.status(400).json({ error: "\u30E6\u30FC\u30B6\u30FC\u540D\u306F24\u6587\u5B57\u4EE5\u5185\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002" });
    }
    if (hasTursoConfig()) {
      const authUser2 = await tursoGetUserByToken(getRequestToken(req));
      if (!authUser2) {
        return res.status(401).json({ error: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059\u3002\u518D\u30ED\u30B0\u30A4\u30F3\u3057\u3066\u304F\u3060\u3055\u3044\u3002" });
      }
      if (newTrimmed === authUser2.username) {
        return res.json({ success: true, username: newTrimmed });
      }
      const renamed = await tursoRenameUser(authUser2.username, newTrimmed);
      if (renamed.conflict) {
        return res.status(409).json({ error: "\u3053\u306E\u30E6\u30FC\u30B6\u30FC\u540D\u306F\u65E2\u306B\u4F7F\u7528\u3055\u308C\u3066\u3044\u308B\u305F\u3081\u5909\u66F4\u3067\u304D\u307E\u305B\u3093\u3002" });
      }
      return res.json({ success: true, username: newTrimmed });
    }
    const db = readWeTalksDB();
    const authUser = authenticateUser(req, db);
    if (!authUser) {
      return res.status(401).json({ error: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059\u3002\u518D\u30ED\u30B0\u30A4\u30F3\u3057\u3066\u304F\u3060\u3055\u3044\u3002" });
    }
    const oldName = authUser.username;
    if (newTrimmed === oldName) {
      return res.json({ success: true, username: newTrimmed });
    }
    const conflict = db.users.some(
      (u) => u !== authUser && u.username.toLowerCase().trim() === newTrimmed.toLowerCase()
    );
    if (conflict) {
      return res.status(409).json({ error: "\u3053\u306E\u30E6\u30FC\u30B6\u30FC\u540D\u306F\u65E2\u306B\u4F7F\u7528\u3055\u308C\u3066\u3044\u308B\u305F\u3081\u5909\u66F4\u3067\u304D\u307E\u305B\u3093\u3002" });
    }
    authUser.username = newTrimmed;
    db.messages.forEach((m) => {
      if (m.sender === oldName) {
        m.sender = newTrimmed;
      }
      if (m.reply_to && m.reply_to.sender === oldName) {
        m.reply_to.sender = newTrimmed;
      }
      if (Array.isArray(m.read_by) && m.read_by.includes(oldName)) {
        m.read_by = Array.from(new Set(m.read_by.map((r) => r === oldName ? newTrimmed : r).filter((r) => r && r !== m.sender)));
      }
    });
    db.rooms.forEach((r) => {
      if (r.created_by === oldName) {
        r.created_by = newTrimmed;
      }
      if (Array.isArray(r.members)) {
        r.members = Array.from(new Set(r.members.map((m) => m === oldName ? newTrimmed : m)));
      }
      if (r.type === "direct" && r.name) {
        const parts = r.name.replace(/@/g, "").split(" & ");
        if (parts.length === 2 && (parts[0] === oldName || parts[1] === oldName)) {
          const updatedParts = parts.map((p) => p === oldName ? newTrimmed : p).sort();
          r.name = "@" + updatedParts[0] + " & @" + updatedParts[1];
        }
      }
    });
    writeWeTalksDB(db);
    return res.json({ success: true, username: newTrimmed });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u30E6\u30FC\u30B6\u30FC\u540D\u5909\u66F4\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
var wetalksPresence = /* @__PURE__ */ new Map();
app.post("/api/wetalks/presence", async (req, res) => {
  try {
    const { clientId, username, roomId, offline } = req.body || {};
    if (hasTursoConfig()) {
      const authUser2 = await tursoGetUserByToken(getRequestToken(req));
      const resolvedName2 = authUser2 ? authUser2.username : String(username || "").trim();
      const result = await tursoSyncPresence(
        String(clientId || "").trim(),
        resolvedName2,
        roomId ? String(roomId) : "",
        offline === true
      );
      return res.json(result);
    }
    const db = readWeTalksDB();
    const authUser = authenticateUser(req, db);
    const resolvedName = authUser ? authUser.username : String(username || "").trim();
    const now = Date.now();
    if (offline && clientId) {
      wetalksPresence.delete(String(clientId));
    } else if (clientId && resolvedName && resolvedName !== "\u30B2\u30B9\u30C8") {
      wetalksPresence.set(String(clientId), {
        username: resolvedName,
        roomId: roomId ? String(roomId) : null,
        lastSeen: now
      });
    }
    for (const [key, val] of wetalksPresence.entries()) {
      if (now - val.lastSeen > 2e4) {
        wetalksPresence.delete(key);
      }
    }
    const activeClients = Array.from(wetalksPresence.values());
    const userMap = /* @__PURE__ */ new Map();
    activeClients.forEach((c) => {
      const uname = String(c.username || "").trim();
      if (uname && uname !== "\u30B2\u30B9\u30C8") {
        const k = uname.toLowerCase();
        if (!userMap.has(k)) userMap.set(k, uname);
      }
    });
    const onlineUsers = Array.from(userMap.values());
    const roomMembers = roomId ? Array.from(new Set(activeClients.filter((c) => c.roomId === roomId && c.username !== "\u30B2\u30B9\u30C8").map((c) => c.username))) : [];
    const fallbackSelf = !offline && resolvedName && resolvedName !== "\u30B2\u30B9\u30C8" ? 1 : 0;
    return res.json({
      presenceSupported: true,
      onlineCount: onlineUsers.length > 0 ? onlineUsers.length : fallbackSelf,
      onlineUsers,
      roomMembers
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u30D7\u30EC\u30BC\u30F3\u30B9\u66F4\u65B0\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
app.get("/api/wetalks/rooms", async (req, res) => {
  try {
    if (hasTursoConfig()) {
      const authUser2 = await tursoGetUserByToken(getRequestToken(req));
      if (!authUser2) return res.json([]);
      const rooms2 = await tursoGetRoomsForUser(authUser2.username);
      return res.json(rooms2);
    }
    const db = readWeTalksDB();
    const authUser = authenticateUser(req, db);
    if (!authUser) {
      return res.json([]);
    }
    const visibleRooms = db.rooms.filter((r) => isUserMemberOfRoom(r, authUser.username));
    return res.json(visibleRooms);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u30EB\u30FC\u30E0\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
app.post("/api/wetalks/rooms", async (req, res) => {
  try {
    const { id, name, type, members } = req.body || {};
    if (!id || !name || !type) {
      return res.status(400).json({ error: "Missing fields" });
    }
    if (hasTursoConfig()) {
      const authUser2 = await tursoGetUserByToken(getRequestToken(req));
      if (!authUser2) {
        return res.status(401).json({ error: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059\u3002" });
      }
      const created = await tursoCreateRoom(authUser2.username, { id, name, type, members });
      if ("error" in created && created.error) {
        return res.status(created.status || 400).json({ error: created.error });
      }
      return res.json({ success: true, room: created.room });
    }
    const db = readWeTalksDB();
    const authUser = authenticateUser(req, db);
    if (!authUser) {
      return res.status(401).json({ error: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059\u3002" });
    }
    if (!db.deleted_rooms) db.deleted_rooms = [];
    db.deleted_rooms = db.deleted_rooms.filter((delId) => delId !== id);
    if (type === "direct") {
      const memberSet2 = /* @__PURE__ */ new Set([authUser.username]);
      if (Array.isArray(members)) {
        members.forEach((m) => {
          const s = String(m || "").trim();
          if (s && s !== "\u30B2\u30B9\u30C8") memberSet2.add(s);
        });
      }
      if (memberSet2.size < 2 && typeof name === "string") {
        const parts = name.replace(/@/g, "").split(" & ").map((s) => s.trim()).filter(Boolean);
        parts.forEach((p) => {
          if (p !== "\u30B2\u30B9\u30C8") memberSet2.add(p);
        });
      }
      const finalMembers = Array.from(memberSet2).slice(0, 2);
      if (finalMembers.length !== 2) {
        return res.status(400).json({ error: "1\u5BFE1\u30C8\u30FC\u30AF\u306B\u306F\u76F8\u624B\u306E\u30E6\u30FC\u30B6\u30FC\u304C\u5FC5\u8981\u3067\u3059\u3002" });
      }
      const sorted = [...finalMembers].sort();
      const canonicalName = "@" + sorted[0] + " & @" + sorted[1];
      const existingDirect = db.rooms.find((r) => {
        if (r.type !== "direct") return false;
        if (Array.isArray(r.members) && r.members.length === 2) {
          return r.members.includes(sorted[0]) && r.members.includes(sorted[1]);
        }
        return r.name === canonicalName;
      });
      if (existingDirect) {
        if (!Array.isArray(existingDirect.members)) {
          existingDirect.members = sorted;
          writeWeTalksDB(db);
        }
        return res.json({ success: true, room: existingDirect });
      }
      const existingById = db.rooms.find((r) => r.id === id);
      if (existingById) {
        return res.json({ success: true, room: existingById });
      }
      const newDirectRoom = {
        id,
        name: canonicalName,
        type: "direct",
        members: sorted,
        created_by: authUser.username
      };
      db.rooms.push(newDirectRoom);
      writeWeTalksDB(db);
      return res.json({ success: true, room: newDirectRoom });
    }
    const existing = db.rooms.find((r) => r.id === id);
    if (existing) {
      if (!isUserMemberOfRoom(existing, authUser.username)) {
        return res.status(403).json({ error: "\u3053\u306E\u30EB\u30FC\u30E0\u306B\u30A2\u30AF\u30BB\u30B9\u3059\u308B\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093\u3002" });
      }
      return res.json({ success: true, room: existing });
    }
    const registeredUsernames = new Set(db.users.map((u) => u.username));
    const memberSet = /* @__PURE__ */ new Set([authUser.username]);
    if (Array.isArray(members)) {
      members.forEach((m) => {
        const s = String(m || "").trim();
        if (s && s !== "\u30B2\u30B9\u30C8" && registeredUsernames.has(s)) {
          memberSet.add(s);
        }
      });
    }
    const newRoom = {
      id,
      name: String(name).trim(),
      type: "group",
      members: Array.from(memberSet),
      created_by: authUser.username
    };
    db.rooms.push(newRoom);
    writeWeTalksDB(db);
    return res.json({ success: true, room: newRoom });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u30EB\u30FC\u30E0\u4F5C\u6210\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
app.post("/api/wetalks/rooms/:id/invite", async (req, res) => {
  try {
    const { id } = req.params;
    const { members, username } = req.body || {};
    const candidates = [];
    if (Array.isArray(members)) {
      members.forEach((m) => candidates.push(String(m || "").trim()));
    }
    if (username) {
      candidates.push(String(username).trim());
    }
    if (hasTursoConfig()) {
      const authUser2 = await tursoGetUserByToken(getRequestToken(req));
      if (!authUser2) {
        return res.status(401).json({ error: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059\u3002" });
      }
      const invited = await tursoInviteToRoom(id, authUser2.username, candidates);
      if ("error" in invited && invited.error) {
        return res.status(invited.status || 400).json({ error: invited.error });
      }
      return res.json({ success: true, room: invited.room, addedMembers: invited.addedMembers });
    }
    const db = readWeTalksDB();
    const authUser = authenticateUser(req, db);
    if (!authUser) {
      return res.status(401).json({ error: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059\u3002" });
    }
    const room = db.rooms.find((r) => r.id === id);
    if (!room) {
      return res.status(404).json({ error: "\u30C8\u30FC\u30AF\u30EB\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002" });
    }
    if (room.type !== "group") {
      return res.status(400).json({ error: "\u30B0\u30EB\u30FC\u30D7\u30C8\u30FC\u30AF\u306E\u307F\u30E1\u30F3\u30D0\u30FC\u3092\u62DB\u5F85\u3067\u304D\u307E\u3059\u3002" });
    }
    if (!isUserMemberOfRoom(room, authUser.username)) {
      return res.status(403).json({ error: "\u3053\u306E\u30B0\u30EB\u30FC\u30D7\u306E\u30E1\u30F3\u30D0\u30FC\u306E\u307F\u62DB\u5F85\u3067\u304D\u307E\u3059\u3002" });
    }
    const registeredUsernames = new Set(db.users.map((u) => u.username));
    const currentMembers = Array.isArray(room.members) ? [...room.members] : [authUser.username];
    const memberSet = new Set(currentMembers);
    const addedMembers = [];
    candidates.forEach((c) => {
      if (c && c !== "\u30B2\u30B9\u30C8" && registeredUsernames.has(c) && !memberSet.has(c)) {
        memberSet.add(c);
        addedMembers.push(c);
      }
    });
    room.members = Array.from(memberSet);
    writeWeTalksDB(db);
    return res.json({ success: true, room, addedMembers });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u62DB\u5F85\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
app.delete("/api/wetalks/rooms/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (hasTursoConfig()) {
      await tursoDeleteRoom(id);
      return res.json({ success: true });
    }
    const db = readWeTalksDB();
    if (!db.deleted_rooms) db.deleted_rooms = [];
    if (!db.deleted_rooms.includes(id)) {
      db.deleted_rooms.push(id);
    }
    db.rooms = db.rooms.filter((r) => r.id !== id);
    db.messages = db.messages.filter((m) => m.room_id !== id);
    writeWeTalksDB(db);
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u30EB\u30FC\u30E0\u524A\u9664\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
app.post("/api/wetalks/rooms/:id/read", async (req, res) => {
  try {
    const { id } = req.params;
    if (hasTursoConfig()) {
      const authUser2 = await tursoGetUserByToken(getRequestToken(req));
      if (!authUser2) {
        return res.status(401).json({ error: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059\u3002" });
      }
      const room2 = await tursoGetRoomById(id);
      if (room2 && !isMemberOfTursoRoom(room2, authUser2.username)) {
        return res.status(403).json({ error: "\u3053\u306E\u30C8\u30FC\u30AF\u30EB\u30FC\u30E0\u3092\u95B2\u89A7\u3059\u308B\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093\u3002" });
      }
      const updatedCount2 = await tursoMarkMessagesRead(id, authUser2.username);
      if (updatedCount2 > 0) {
        broadcastWetalksEvent("read", id);
      }
      return res.json({ success: true, updatedCount: updatedCount2 });
    }
    const db = readWeTalksDB();
    const authUser = authenticateUser(req, db);
    if (!authUser) {
      return res.status(401).json({ error: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059\u3002" });
    }
    const room = db.rooms.find((r) => r.id === id);
    if (room && !isUserMemberOfRoom(room, authUser.username)) {
      return res.status(403).json({ error: "\u3053\u306E\u30C8\u30FC\u30AF\u30EB\u30FC\u30E0\u3092\u95B2\u89A7\u3059\u308B\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093\u3002" });
    }
    const updatedCount = markRoomMessagesAsRead(db, id, authUser.username);
    if (updatedCount > 0) {
      broadcastWetalksEvent("read", id);
    }
    return res.json({ success: true, updatedCount });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u65E2\u8AAD\u66F4\u65B0\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
app.get("/api/wetalks/messages/:roomId", async (req, res) => {
  try {
    const { roomId } = req.params;
    const markRead = req.query.markRead === "1" || req.query.markRead === "true";
    const isSummary = req.query.summary === "1" || req.query.summary === "true";
    const after = String(req.query.after || "").trim();
    if (hasTursoConfig()) {
      const authUser2 = await tursoGetUserByToken(getRequestToken(req));
      if (!authUser2) {
        return res.status(401).json({ error: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059\u3002" });
      }
      const room2 = await tursoGetRoomById(roomId);
      if (room2 && !isMemberOfTursoRoom(room2, authUser2.username)) {
        return res.status(403).json({ error: "\u3053\u306E\u30C8\u30FC\u30AF\u30EB\u30FC\u30E0\u3092\u95B2\u89A7\u3059\u308B\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093\u3002" });
      }
      if (markRead) {
        const updatedCount = await tursoMarkMessagesRead(roomId, authUser2.username);
        if (updatedCount > 0) {
          broadcastWetalksEvent("read", roomId);
        }
      }
      const msgs2 = await tursoGetMessagesForRoom(roomId, { summary: isSummary, after });
      return res.json(msgs2);
    }
    const db = readWeTalksDB();
    const authUser = authenticateUser(req, db);
    if (!authUser) {
      return res.status(401).json({ error: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059\u3002" });
    }
    const room = db.rooms.find((r) => r.id === roomId);
    if (room && !isUserMemberOfRoom(room, authUser.username)) {
      return res.status(403).json({ error: "\u3053\u306E\u30C8\u30FC\u30AF\u30EB\u30FC\u30E0\u3092\u95B2\u89A7\u3059\u308B\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093\u3002" });
    }
    if (markRead) {
      const updatedCount = markRoomMessagesAsRead(db, roomId, authUser.username);
      if (updatedCount > 0) {
        broadcastWetalksEvent("read", roomId);
      }
    }
    let filtered = db.messages.filter((m) => m.room_id === roomId && (!after || String(m.created_at || "") > after));
    if (isSummary && !after && filtered.length > 30) {
      filtered = filtered.slice(-30);
    }
    const msgs = filtered.map((m) => {
      const cleanReadBy = Array.isArray(m.read_by) ? m.read_by.filter((u) => u && u !== m.sender) : [];
      if (isSummary) {
        return {
          id: m.id,
          room_id: m.room_id,
          sender: m.sender,
          text: m.text,
          has_image: !!m.image_base64,
          image_expired: !!m.image_expired,
          read_by: cleanReadBy,
          created_at: m.created_at
        };
      }
      return {
        ...m,
        read_by: cleanReadBy
      };
    });
    return res.json(msgs);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u30E1\u30C3\u30BB\u30FC\u30B8\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
app.post("/api/wetalks/messages", async (req, res) => {
  try {
    const { id, room_id, text, image_base64, reply_to, created_at } = req.body || {};
    const cleanText = String(text || "").trim();
    const cleanImage = typeof image_base64 === "string" ? image_base64.trim() : "";
    if (!room_id || !cleanText && !cleanImage) {
      return res.status(400).json({ error: "Missing fields" });
    }
    if (cleanImage) {
      if (!/^data:image\/(png|jpeg|jpg|gif|webp|bmp);base64,[A-Za-z0-9+/=]+$/i.test(cleanImage)) {
        return res.status(400).json({ error: "\u7121\u52B9\u306A\u753B\u50CF\u5F62\u5F0F\u3067\u3059\u3002" });
      }
      if (cleanImage.length > 5 * 1024 * 1024) {
        return res.status(413).json({ error: "\u753B\u50CF\u30B5\u30A4\u30BA\u304C\u5927\u304D\u3059\u304E\u307E\u3059\u3002" });
      }
    }
    let cleanReply = null;
    if (reply_to && typeof reply_to === "object" && reply_to.id) {
      cleanReply = {
        id: String(reply_to.id).slice(0, 120),
        sender: String(reply_to.sender || "").slice(0, 40),
        text: String(reply_to.text || "").slice(0, 200),
        ...reply_to.has_image ? { has_image: true } : {}
      };
    }
    if (hasTursoConfig()) {
      const authUser2 = await tursoGetUserByToken(getRequestToken(req));
      if (!authUser2) {
        return res.status(401).json({ error: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059\u3002" });
      }
      const room2 = await tursoGetRoomById(room_id);
      if (room2 && !isMemberOfTursoRoom(room2, authUser2.username)) {
        return res.status(403).json({ error: "\u3053\u306E\u30C8\u30FC\u30AF\u30EB\u30FC\u30E0\u306B\u9001\u4FE1\u3059\u308B\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093\u3002" });
      }
      const msgId2 = id || "m-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4);
      const newMsg2 = {
        id: msgId2,
        room_id,
        sender: authUser2.username,
        text: cleanText,
        image_base64: cleanImage,
        ...cleanReply ? { reply_to: cleanReply } : {},
        read_by: [],
        created_at: created_at || (/* @__PURE__ */ new Date()).toISOString()
      };
      await tursoInsertMessage(newMsg2);
      broadcastWetalksEvent("message", room_id, {
        message: {
          id: newMsg2.id,
          room_id,
          sender: authUser2.username,
          text: cleanText.slice(0, 300),
          has_image: !!cleanImage,
          created_at: newMsg2.created_at
        },
        roomName: room2?.name || "",
        members: Array.isArray(room2?.members) ? room2.members : void 0
      });
      return res.json({ success: true, message: newMsg2 });
    }
    const db = readWeTalksDB();
    const authUser = authenticateUser(req, db);
    if (!authUser) {
      return res.status(401).json({ error: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059\u3002" });
    }
    const room = db.rooms.find((r) => r.id === room_id);
    if (room && !isUserMemberOfRoom(room, authUser.username)) {
      return res.status(403).json({ error: "\u3053\u306E\u30C8\u30FC\u30AF\u30EB\u30FC\u30E0\u306B\u9001\u4FE1\u3059\u308B\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093\u3002" });
    }
    const msgId = id || "m-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4);
    const existing = db.messages.find((m) => m.id === msgId);
    if (existing) {
      return res.json({ success: true, message: existing });
    }
    const newMsg = {
      id: msgId,
      room_id,
      sender: authUser.username,
      text: cleanText,
      ...cleanImage ? { image_base64: cleanImage } : {},
      ...cleanReply ? { reply_to: cleanReply } : {},
      read_by: [],
      created_at: created_at || (/* @__PURE__ */ new Date()).toISOString()
    };
    db.messages.push(newMsg);
    writeWeTalksDB(db);
    broadcastWetalksEvent("message", room_id, {
      message: {
        id: newMsg.id,
        room_id,
        sender: authUser.username,
        text: cleanText.slice(0, 300),
        has_image: !!cleanImage,
        created_at: newMsg.created_at
      },
      roomName: room?.name || "",
      members: Array.isArray(room?.members) ? room.members : void 0
    });
    return res.json({ success: true, message: newMsg });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u30E1\u30C3\u30BB\u30FC\u30B8\u9001\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
app.get("/api/wetalks/sync", async (req, res) => {
  try {
    const after = String(req.query.after || "").trim();
    const roomId = String(req.query.roomId || "").trim();
    const roomAfter = String(req.query.roomAfter || "").trim();
    const broadcastAfter = String(req.query.broadcastAfter || "").trim();
    const includeRooms = req.query.includeRooms === "1";
    const waitMs = Math.min(Math.max(Number(req.query.waitMs || 0) || 0, 0), 8e3);
    const token = getRequestToken(req);
    if (hasTursoConfig()) {
      let snapshot = await tursoSyncSnapshot({ token, after, roomId, roomAfter, broadcastAfter, includeRooms });
      const hasInitial2 = snapshot.broadcasts.length > 0 || snapshot.messages.length > 0 || snapshot.roomMessages.length > 0;
      if (!hasInitial2 && waitMs > 0 && (after || broadcastAfter || roomAfter)) {
        const deadline = Date.now() + waitMs;
        let closed = false;
        req.on("close", () => {
          closed = true;
        });
        while (!closed && Date.now() < deadline) {
          const remaining = deadline - Date.now();
          if (remaining <= 20) break;
          const woke = await waitExpressSyncWakeup(Math.min(350, remaining), roomId);
          if (closed) break;
          if (woke) {
            snapshot = await tursoSyncSnapshot({ token, after, roomId, roomAfter, broadcastAfter, includeRooms });
            if (woke.kind === "read" || snapshot.broadcasts.length > 0 || snapshot.messages.length > 0 || snapshot.roomMessages.length > 0) {
              break;
            }
            continue;
          }
          const probe = await tursoProbeMaxTimestamps();
          if (after && probe.latestMsgAt > after || roomAfter && probe.latestMsgAt > roomAfter || broadcastAfter && probe.latestBroadcastAt > broadcastAfter) {
            snapshot = await tursoSyncSnapshot({ token, after, roomId, roomAfter, broadcastAfter, includeRooms });
            break;
          }
        }
      }
      return res.json({
        success: true,
        serverTime: (/* @__PURE__ */ new Date()).toISOString(),
        latestMsgAt: snapshot.latestMsgAt,
        latestBroadcastAt: snapshot.latestBroadcastAt,
        messages: snapshot.messages,
        roomMessages: snapshot.roomMessages,
        readUpdates: snapshot.readUpdates,
        broadcasts: snapshot.broadcasts,
        ...snapshot.rooms ? { rooms: snapshot.rooms } : {}
      });
    }
    const buildLocalSnapshot = () => {
      const db = readWeTalksDB();
      const authUser = token ? db.users.find((u) => u.token && u.token === token) || null : null;
      const broadcastsAll = readBroadcasts();
      const latestBroadcastAt = broadcastsAll.length > 0 ? String(broadcastsAll[broadcastsAll.length - 1]?.timestamp || "") : "";
      const latestMsgAt = db.messages.length > 0 ? db.messages.reduce((max, m) => String(m.created_at || "") > max ? String(m.created_at || "") : max, "") : "";
      const broadcasts = broadcastAfter ? broadcastsAll.filter((b) => String(b.timestamp || "") > broadcastAfter) : broadcastsAll;
      const myRooms = authUser ? db.rooms.filter((r) => isUserMemberOfRoom(r, authUser.username)) : [];
      const allowedSet = new Set(myRooms.map((r) => r.id));
      const messages = authUser && after ? db.messages.filter((m) => String(m.created_at || "") > after && allowedSet.has(m.room_id)).slice(-60).map((m) => ({
        id: m.id,
        room_id: m.room_id,
        sender: m.sender,
        text: m.text || "",
        has_image: Boolean(m.image_base64),
        read_by: Array.isArray(m.read_by) ? m.read_by.filter((u) => u && u !== m.sender) : [],
        created_at: m.created_at
      })) : [];
      const roomMessages = authUser && roomId && roomAfter && allowedSet.has(roomId) ? db.messages.filter((m) => m.room_id === roomId && String(m.created_at || "") > roomAfter).slice(-80) : [];
      const readUpdates = authUser && roomId && allowedSet.has(roomId) ? db.messages.filter((m) => m.room_id === roomId).slice(-25).map((m) => ({
        id: m.id,
        read_by: Array.isArray(m.read_by) ? m.read_by.filter((u) => u && u !== m.sender) : []
      })) : [];
      return {
        latestMsgAt,
        latestBroadcastAt,
        messages,
        roomMessages,
        readUpdates,
        broadcasts,
        ...includeRooms && authUser ? { rooms: myRooms } : {}
      };
    };
    let snap = buildLocalSnapshot();
    const hasInitial = snap.broadcasts.length > 0 || snap.messages.length > 0 || snap.roomMessages.length > 0;
    if (!hasInitial && waitMs > 0 && (after || broadcastAfter || roomAfter)) {
      const woke = await waitExpressSyncWakeup(waitMs, roomId);
      if (woke) {
        snap = buildLocalSnapshot();
      }
    }
    return res.json({
      success: true,
      serverTime: (/* @__PURE__ */ new Date()).toISOString(),
      ...snap
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Sync error" });
  }
});
app.get("/api/wetalks/admin/overview", async (req, res) => {
  if (!isAdminAuthorized(req)) {
    return res.status(401).json({ error: "\u7BA1\u7406\u8005\u8A8D\u8A3C\u304C\u5FC5\u8981\u3067\u3059\u3002" });
  }
  try {
    if (hasTursoConfig()) {
      const overview = await tursoGetAdminOverview();
      return res.json(overview);
    }
    const db = readWeTalksDB();
    const roomMap = new Map(db.rooms.map((r) => [r.id, r.name]));
    const imagesCount = db.messages.filter((m) => !!m.image_base64).length;
    const users = db.users.map((u) => ({
      username: u.username,
      has_password: !!(u.password_hash || u.password_numeric),
      password_storage: u.password_hash ? "scrypt\u6697\u53F7\u5316\u4FDD\u5B58\u6E08\u307F" : u.password_numeric ? "\u4FDD\u5B58\u6E08\u307F" : "\u672A\u8A2D\u5B9A",
      avatar_base64: u.avatar_base64 || ""
    }));
    const rooms2 = db.rooms.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      members: Array.isArray(r.members) ? r.members : [],
      message_count: db.messages.filter((m) => m.room_id === r.id).length
    }));
    const recentMessages = db.messages.slice(-50).reverse().map((m) => {
      const createdMs = Date.parse(m.created_at || "");
      const expiresAt = m.image_base64 && !Number.isNaN(createdMs) ? new Date(createdMs + IMAGE_RETENTION_MS).toISOString() : null;
      return {
        id: m.id,
        room_id: m.room_id,
        room_name: roomMap.get(m.room_id) || m.room_id,
        sender: m.sender,
        text: m.text,
        has_image: !!m.image_base64,
        image_base64: m.image_base64 || "",
        image_expired: !!m.image_expired,
        created_at: m.created_at,
        image_expires_at: expiresAt
      };
    });
    return res.json({
      success: true,
      backend: "\u5185\u8535 Express \u30B5\u30FC\u30D0\u30FC (wetalks_db.json)",
      hasTurso: false,
      storage_verified: true,
      image_retention_days: IMAGE_RETENTION_DAYS,
      checked_at: (/* @__PURE__ */ new Date()).toISOString(),
      counts: {
        users: db.users.length,
        rooms: db.rooms.length,
        messages: db.messages.length,
        images: imagesCount
      },
      users,
      rooms: rooms2,
      recent_messages: recentMessages
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u7BA1\u7406\u6982\u8981\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
app.post("/api/wetalks/admin/prune-images", async (req, res) => {
  if (!isAdminAuthorized(req)) {
    return res.status(401).json({ error: "\u7BA1\u7406\u8005\u8A8D\u8A3C\u304C\u5FC5\u8981\u3067\u3059\u3002" });
  }
  try {
    if (hasTursoConfig()) {
      const prunedCount2 = await tursoPruneExpiredImages(true);
      return res.json({ success: true, prunedCount: prunedCount2 });
    }
    const db = readWeTalksDB();
    const prunedCount = pruneExpiredWeTalksImages(db);
    const remainingImages = db.messages.filter((m) => !!m.image_base64).length;
    return res.json({ success: true, prunedCount, remainingImages });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u753B\u50CF\u6574\u7406\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
app.delete("/api/wetalks/admin/messages/:id", async (req, res) => {
  if (!isAdminAuthorized(req)) {
    return res.status(401).json({ error: "\u7BA1\u7406\u8005\u8A8D\u8A3C\u304C\u5FC5\u8981\u3067\u3059\u3002" });
  }
  try {
    const { id } = req.params;
    if (hasTursoConfig()) {
      await tursoDeleteMessage(id);
      return res.json({ success: true });
    }
    const db = readWeTalksDB();
    const before = db.messages.length;
    db.messages = db.messages.filter((m) => m.id !== id);
    if (db.messages.length !== before) {
      writeWeTalksDB(db);
    }
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u30E1\u30C3\u30BB\u30FC\u30B8\u524A\u9664\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
app.delete("/api/wetalks/admin/users/:username", async (req, res) => {
  if (!isAdminAuthorized(req)) {
    return res.status(401).json({ error: "\u7BA1\u7406\u8005\u8A8D\u8A3C\u304C\u5FC5\u8981\u3067\u3059\u3002" });
  }
  try {
    const target = String(req.params.username || "").trim().toLowerCase();
    if (hasTursoConfig()) {
      await tursoDeleteUser(target);
      return res.json({ success: true });
    }
    const db = readWeTalksDB();
    const before = db.users.length;
    db.users = db.users.filter((u) => u.username.toLowerCase().trim() !== target);
    if (db.users.length !== before) {
      writeWeTalksDB(db);
    }
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u30E6\u30FC\u30B6\u30FC\u524A\u9664\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
app.get("/api/wetalks/admin/rooms/:id/messages", async (req, res) => {
  if (!isAdminAuthorized(req)) {
    return res.status(401).json({ error: "\u7BA1\u7406\u8005\u8A8D\u8A3C\u304C\u5FC5\u8981\u3067\u3059\u3002" });
  }
  try {
    const roomId = req.params.id;
    if (hasTursoConfig()) {
      const result = await tursoGetAdminRoomMessages(roomId);
      return res.json(result);
    }
    const db = readWeTalksDB();
    const room = db.rooms.find((r) => r.id === roomId) || null;
    const messages = db.messages.filter((m) => m.room_id === roomId).map((m) => {
      const createdMs = Date.parse(m.created_at || "");
      const expiresAt = m.image_base64 && !Number.isNaN(createdMs) ? new Date(createdMs + IMAGE_RETENTION_MS).toISOString() : null;
      return {
        ...m,
        has_image: !!m.image_base64,
        image_expires_at: expiresAt,
        read_by: Array.isArray(m.read_by) ? m.read_by.filter((u) => u && u !== m.sender) : []
      };
    });
    return res.json({ success: true, room, messages });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u30EB\u30FC\u30E0\u30E1\u30C3\u30BB\u30FC\u30B8\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
app.get("/api/wetalks/admin/export", async (req, res) => {
  if (!isAdminAuthorized(req)) {
    return res.status(401).json({ error: "\u7BA1\u7406\u8005\u8A8D\u8A3C\u304C\u5FC5\u8981\u3067\u3059\u3002" });
  }
  try {
    if (hasTursoConfig()) {
      const bundle = await tursoExportBundle();
      return res.json({ success: true, source: "turso", exportedAt: (/* @__PURE__ */ new Date()).toISOString(), ...bundle });
    }
    const db = readWeTalksDB();
    const broadcasts = readBroadcasts();
    return res.json({
      success: true,
      source: "local_json",
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      users: db.users,
      rooms: db.rooms,
      messages: db.messages,
      deleted_rooms: db.deleted_rooms || [],
      broadcasts
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
app.post("/api/wetalks/admin/import", async (req, res) => {
  if (!isAdminAuthorized(req)) {
    return res.status(401).json({ error: "\u7BA1\u7406\u8005\u8A8D\u8A3C\u304C\u5FC5\u8981\u3067\u3059\u3002" });
  }
  try {
    const bundle = req.body || {};
    if (hasTursoConfig()) {
      const summary = await tursoImportBundle(bundle);
      return res.json({ success: true, target: "turso", ...summary });
    }
    const db = readWeTalksDB();
    let usersImported = 0;
    let roomsImported = 0;
    let messagesImported = 0;
    let broadcastsImported = 0;
    const existingUsers = new Set(db.users.map((u) => u.username.toLowerCase()));
    for (const u of bundle.users || []) {
      const uname = String(u?.username || "").trim();
      if (!uname || existingUsers.has(uname.toLowerCase())) continue;
      existingUsers.add(uname.toLowerCase());
      db.users.push({
        username: uname,
        password_numeric: String(u.password_numeric || ""),
        password_hash: String(u.password_hash || ""),
        token: String(u.token || import_crypto2.default.randomBytes(24).toString("hex")),
        avatar_base64: String(u.avatar_base64 || "")
      });
      usersImported++;
    }
    const existingRoomIds = new Set(db.rooms.map((r) => r.id));
    for (const r of bundle.rooms || []) {
      if (!r?.id || existingRoomIds.has(r.id)) continue;
      existingRoomIds.add(r.id);
      db.rooms.push({
        id: String(r.id),
        name: String(r.name || ""),
        type: String(r.type || "group"),
        members: Array.isArray(r.members) ? r.members.map(String) : [],
        created_by: String(r.created_by || "")
      });
      roomsImported++;
    }
    const existingMsgIds = new Set(db.messages.map((m) => m.id));
    for (const m of bundle.messages || []) {
      if (!m?.id || existingMsgIds.has(m.id)) continue;
      existingMsgIds.add(m.id);
      db.messages.push(m);
      messagesImported++;
    }
    writeWeTalksDB(db);
    if (Array.isArray(bundle.broadcasts) && bundle.broadcasts.length > 0) {
      const bcs = readBroadcasts();
      const bcIds = new Set(bcs.map((b) => b.id));
      for (const bc of bundle.broadcasts) {
        if (bc?.id && !bcIds.has(bc.id)) {
          bcIds.add(bc.id);
          bcs.push(bc);
          broadcastsImported++;
        }
      }
      writeBroadcasts(bcs);
    }
    return res.json({
      success: true,
      target: "local_json",
      usersImported,
      roomsImported,
      messagesImported,
      deletedRoomsImported: 0,
      broadcastsImported
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u30A4\u30F3\u30DD\u30FC\u30C8\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
app.post("/api/wetalks/admin/migrate-from-cloudflare", async (req, res) => {
  if (!isAdminAuthorized(req)) {
    return res.status(401).json({ error: "\u7BA1\u7406\u8005\u8A8D\u8A3C\u304C\u5FC5\u8981\u3067\u3059\u3002" });
  }
  try {
    const rawWorkerUrl = String(req.body?.workerUrl || "").trim().replace(/\/+$/, "");
    const sourcePasscode = String(req.body?.sourcePasscode || req.body?.passcode || req.headers["x-admin-passcode"] || "mozunbu1203").trim();
    if (!rawWorkerUrl) {
      return res.status(400).json({ error: "\u79FB\u884C\u5143\u306E Cloudflare Worker URL \u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002" });
    }
    let parsedUrl;
    try {
      parsedUrl = new URL(rawWorkerUrl);
    } catch {
      return res.status(400).json({ error: "\u7121\u52B9\u306A Worker URL \u5F62\u5F0F\u3067\u3059\u3002" });
    }
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      return res.status(400).json({ error: "HTTP/HTTPS \u306E Worker URL \u3092\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002" });
    }
    if (isPrivateOrDisallowedHost(parsedUrl.hostname)) {
      return res.status(400).json({ error: "\u30D7\u30E9\u30A4\u30D9\u30FC\u30C8\u307E\u305F\u306F\u30ED\u30FC\u30AB\u30EB\u30DB\u30B9\u30C8\u3078\u306E\u79FB\u884C\u30EA\u30AF\u30A8\u30B9\u30C8\u306F\u8A31\u53EF\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002" });
    }
    const base = parsedUrl.origin;
    let bundle = null;
    const exportResp = await fetch(`${base}/api/wetalks/admin/export?passcode=${encodeURIComponent(sourcePasscode)}`, {
      headers: { "x-admin-passcode": sourcePasscode }
    }).catch(() => null);
    if (exportResp && exportResp.ok) {
      bundle = await exportResp.json().catch(() => null);
    } else if (exportResp && exportResp.status >= 400) {
      const errBody = await exportResp.json().catch(() => ({}));
      const errText = String(errBody?.error || "");
      if (errText.includes("D1_ERROR") || errText.toLowerCase().includes("limit")) {
        return res.status(429).json({
          error: "Cloudflare D1 \u306E\u7121\u6599\u67A0\u8AAD\u307F\u53D6\u308A\u4E0A\u9650\u306B\u9054\u3057\u3066\u3044\u308B\u305F\u3081 API \u7D4C\u7531\u306E\u8AAD\u307F\u51FA\u3057\u304C\u30D6\u30ED\u30C3\u30AF\u3055\u308C\u3066\u3044\u307E\u3059\u3002CLI \u306E `npx wrangler d1 export wetalks-db --remote --output=d1-export.sql` \u3067\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\u3057\u305F\u30D5\u30A1\u30A4\u30EB\u3001\u307E\u305F\u306F\u65E2\u5B58\u306E\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7 JSON \u3092\u304A\u4F7F\u3044\u304F\u3060\u3055\u3044\u3002",
          d1LimitReached: true
        });
      }
    }
    if (!bundle || !Array.isArray(bundle.users)) {
      const ovResp = await fetch(`${base}/api/wetalks/admin/overview?passcode=${encodeURIComponent(sourcePasscode)}`, {
        headers: { "x-admin-passcode": sourcePasscode }
      });
      const ovData = await ovResp.json().catch(() => ({}));
      if (!ovResp.ok) {
        const msg = String(ovData?.error || `HTTP ${ovResp.status}`);
        if (msg.includes("D1_ERROR") || msg.toLowerCase().includes("limit")) {
          return res.status(429).json({
            error: "Cloudflare D1 \u306E\u7121\u6599\u67A0\u4E0A\u9650\u306B\u5230\u9054\u3057\u3066\u3044\u307E\u3059\u3002D1 SQL \u30A8\u30AF\u30B9\u30DD\u30FC\u30C8 (`wrangler d1 export`) \u307E\u305F\u306F JSON \u30D5\u30A1\u30A4\u30EB\u304B\u3089\u79FB\u884C\u3067\u304D\u307E\u3059\u3002",
            d1LimitReached: true
          });
        }
        return res.status(ovResp.status || 502).json({ error: `\u79FB\u884C\u5143 Worker \u304B\u3089\u306E\u53D6\u5F97\u306B\u5931\u6557: ${msg}` });
      }
      const rooms2 = Array.isArray(ovData.rooms) ? ovData.rooms : [];
      const allMessages = [];
      for (const r of rooms2) {
        try {
          const rmResp = await fetch(`${base}/api/wetalks/admin/rooms/${encodeURIComponent(r.id)}/messages?passcode=${encodeURIComponent(sourcePasscode)}`, {
            headers: { "x-admin-passcode": sourcePasscode }
          });
          if (rmResp.ok) {
            const rmData = await rmResp.json().catch(() => ({}));
            if (Array.isArray(rmData.messages)) {
              allMessages.push(...rmData.messages);
            }
          }
        } catch {
        }
      }
      let broadcasts = [];
      try {
        const bcResp = await fetch(`${base}/api/admin/broadcasts`);
        if (bcResp.ok) {
          const bcData = await bcResp.json();
          if (Array.isArray(bcData)) broadcasts = bcData;
        }
      } catch {
      }
      bundle = {
        users: Array.isArray(ovData.users) ? ovData.users : [],
        rooms: rooms2,
        messages: allMessages,
        broadcasts
      };
    }
    if (hasTursoConfig()) {
      const summary = await tursoImportBundle(bundle);
      return res.json({ success: true, target: "turso", ...summary });
    }
    return res.status(400).json({ error: "\u30B5\u30FC\u30D0\u30FC\u306B TURSO_DATABASE_URL / TURSO_AUTH_TOKEN \u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002" });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Cloudflare \u304B\u3089\u306E\u79FB\u884C\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
var httpCallRooms = /* @__PURE__ */ new Map();
var httpCallSignals = /* @__PURE__ */ new Map();
var httpCallSignalSeq = 1;
function getMergedCallParticipants(roomId) {
  const now = Date.now();
  const map = /* @__PURE__ */ new Map();
  const wsPeers = wetalksCallRooms.get(roomId);
  if (wsPeers) {
    wsPeers.forEach((p) => {
      map.set(p.peerId, { peerId: p.peerId, username: p.username, camOn: p.camOn, micOn: p.micOn });
    });
  }
  const httpPeers = httpCallRooms.get(roomId);
  if (httpPeers) {
    for (const [pid, p] of httpPeers.entries()) {
      if (now - p.lastSeen > 12e3) {
        httpPeers.delete(pid);
      } else {
        map.set(p.peerId, { peerId: p.peerId, username: p.username, camOn: p.camOn, micOn: p.micOn });
      }
    }
  }
  return Array.from(map.values());
}
function pushHttpCallSignal(roomId, fromPeerId, targetPeerId, signalType, payload) {
  const list = httpCallSignals.get(roomId) || [];
  const entry = {
    id: httpCallSignalSeq++,
    roomId,
    fromPeerId,
    targetPeerId: targetPeerId || "*",
    signalType,
    payload,
    createdAt: Date.now()
  };
  list.push(entry);
  const cutoff = Date.now() - 9e4;
  httpCallSignals.set(roomId, list.filter((s) => s.createdAt >= cutoff).slice(-200));
  return entry.id;
}
var handleCallProbe = async (req, res) => {
  try {
    const roomId = String(req.query.roomId || req.body?.roomId || "").trim();
    if (!roomId) return res.json({ success: true, roomId: "", participants: [] });
    if (hasTursoConfig()) {
      const participants = await tursoProbeCallParticipants(roomId);
      const merged = new Map(participants.map((p) => [p.peerId, p]));
      getWetalksCallParticipants(roomId).forEach((p) => {
        if (!merged.has(p.peerId)) merged.set(p.peerId, p);
      });
      return res.json({ success: true, roomId, participants: Array.from(merged.values()) });
    }
    return res.json({ success: true, roomId, participants: getMergedCallParticipants(roomId) });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u901A\u8A71\u72B6\u614B\u306E\u78BA\u8A8D\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
};
app.get("/api/wetalks/call/probe", handleCallProbe);
app.post("/api/wetalks/call/probe", handleCallProbe);
var handleCallJoin = async (req, res) => {
  try {
    const roomId = String(req.body?.roomId || "").trim();
    const peerId = String(req.body?.peerId || "").trim();
    const username = String(req.body?.username || "User").trim().slice(0, 32);
    const camOn = Boolean(req.body?.camOn);
    const micOn = req.body?.micOn === true;
    if (!roomId || !peerId) return res.status(400).json({ error: "roomId and peerId are required" });
    if (hasTursoConfig()) {
      const participants = await tursoJoinCall(roomId, peerId, username, camOn, micOn);
      return res.json({ success: true, roomId, peerId, participants });
    }
    let roomMap = httpCallRooms.get(roomId);
    if (!roomMap) {
      roomMap = /* @__PURE__ */ new Map();
      httpCallRooms.set(roomId, roomMap);
    }
    roomMap.set(peerId, { peerId, username, camOn, micOn, lastSeen: Date.now() });
    const wsPeers = wetalksCallRooms.get(roomId);
    if (wsPeers) {
      const msg = JSON.stringify({ type: "wetalks_call_peer_joined", roomId, peer: { peerId, username, camOn, micOn } });
      wsPeers.forEach((p) => {
        if (p.peerId !== peerId && p.ws.readyState === import_ws.WebSocket.OPEN) {
          try {
            p.ws.send(msg);
          } catch {
          }
        }
      });
    }
    return res.json({ success: true, roomId, peerId, participants: getMergedCallParticipants(roomId) });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u901A\u8A71\u53C2\u52A0\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
};
app.post("/api/wetalks/call/join", handleCallJoin);
app.post("/api/wetalks/call/heartbeat", handleCallJoin);
app.post("/api/wetalks/call/media", async (req, res) => {
  try {
    const roomId = String(req.body?.roomId || "").trim();
    const peerId = String(req.body?.peerId || "").trim();
    const camOn = Boolean(req.body?.camOn);
    const micOn = req.body?.micOn === true;
    if (!roomId || !peerId) return res.status(400).json({ error: "roomId and peerId are required" });
    if (hasTursoConfig()) {
      await tursoUpdateCallMedia(roomId, peerId, camOn, micOn);
      return res.json({ success: true });
    }
    const roomMap = httpCallRooms.get(roomId);
    const existing = roomMap?.get(peerId);
    if (existing) {
      existing.camOn = camOn;
      existing.micOn = micOn;
      existing.lastSeen = Date.now();
    }
    const wsPeers = wetalksCallRooms.get(roomId);
    if (wsPeers) {
      const msg = JSON.stringify({ type: "wetalks_call_media_state", roomId, peerId, camOn, micOn });
      wsPeers.forEach((p) => {
        if (p.peerId !== peerId && p.ws.readyState === import_ws.WebSocket.OPEN) {
          try {
            p.ws.send(msg);
          } catch {
          }
        }
      });
    }
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u30E1\u30C7\u30A3\u30A2\u72B6\u614B\u66F4\u65B0\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
app.post("/api/wetalks/call/leave", async (req, res) => {
  try {
    const roomId = String(req.body?.roomId || "").trim();
    const peerId = String(req.body?.peerId || "").trim();
    if (!roomId || !peerId) return res.json({ success: true });
    if (hasTursoConfig()) {
      await tursoLeaveCall(roomId, peerId);
      return res.json({ success: true });
    }
    httpCallRooms.get(roomId)?.delete(peerId);
    pushHttpCallSignal(roomId, peerId, "*", "peer_left", { peerId });
    const wsPeers = wetalksCallRooms.get(roomId);
    if (wsPeers) {
      const msg = JSON.stringify({ type: "wetalks_call_peer_left", roomId, peerId });
      wsPeers.forEach((p) => {
        if (p.peerId !== peerId && p.ws.readyState === import_ws.WebSocket.OPEN) {
          try {
            p.ws.send(msg);
          } catch {
          }
        }
      });
    }
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u901A\u8A71\u9000\u51FA\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
app.post("/api/wetalks/call/signal", async (req, res) => {
  try {
    const roomId = String(req.body?.roomId || "").trim();
    const fromPeerId = String(req.body?.fromPeerId || "").trim();
    const targetPeerId = String(req.body?.targetPeerId || "*").trim();
    const signalType = String(req.body?.signalType || "webrtc").trim();
    const signalPayload = req.body?.signal ?? req.body?.payload ?? {};
    if (!roomId || !fromPeerId) return res.status(400).json({ error: "roomId and fromPeerId are required" });
    if (hasTursoConfig()) {
      const signalId2 = await tursoSendCallSignal(roomId, fromPeerId, targetPeerId, signalType, signalPayload);
      return res.json({ success: true, signalId: signalId2 });
    }
    const signalId = pushHttpCallSignal(roomId, fromPeerId, targetPeerId, signalType, signalPayload);
    const wsPeers = wetalksCallRooms.get(roomId);
    if (wsPeers && signalType === "webrtc") {
      const targetWs = wsPeers.get(targetPeerId);
      if (targetWs && targetWs.ws.readyState === import_ws.WebSocket.OPEN) {
        try {
          targetWs.ws.send(JSON.stringify({ type: "wetalks_call_signal", roomId, fromPeerId, signal: signalPayload }));
        } catch {
        }
      }
    }
    return res.json({ success: true, signalId });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u30B7\u30B0\u30CA\u30EB\u9001\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
app.get("/api/wetalks/call/signals", async (req, res) => {
  try {
    const roomId = String(req.query.roomId || "").trim();
    const peerId = String(req.query.peerId || "").trim();
    const afterId = Number(req.query.afterId || 0) || 0;
    const doHeartbeat = req.query.heartbeat === "1" || req.query.heartbeat === "true";
    const username = doHeartbeat ? String(req.query.username || "User").trim().slice(0, 32) : void 0;
    const camOn = req.query.camOn === "1" || req.query.camOn === "true";
    const micOn = req.query.micOn === "1" || req.query.micOn === "true";
    if (!roomId || !peerId) return res.status(400).json({ error: "roomId and peerId are required" });
    if (hasTursoConfig()) {
      const result = await tursoPollCallSignals(roomId, peerId, afterId, username, camOn, micOn);
      return res.json({ success: true, ...result });
    }
    if (username) {
      let roomMap = httpCallRooms.get(roomId);
      if (!roomMap) {
        roomMap = /* @__PURE__ */ new Map();
        httpCallRooms.set(roomId, roomMap);
      }
      roomMap.set(peerId, { peerId, username, camOn, micOn, lastSeen: Date.now() });
    }
    const participants = getMergedCallParticipants(roomId);
    const rawList = httpCallSignals.get(roomId) || [];
    let latestId = afterId;
    const signals = rawList.filter((s) => {
      if (s.id <= afterId || s.fromPeerId === peerId) return false;
      if (s.targetPeerId !== peerId && s.targetPeerId !== "*") return false;
      if (s.id > latestId) latestId = s.id;
      return true;
    });
    return res.json({ success: true, participants, signals, latestId });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u30B7\u30B0\u30CA\u30EB\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
var httpRelayMembers = /* @__PURE__ */ new Map();
var httpRelayEvents = /* @__PURE__ */ new Map();
var httpRelaySeq = 1;
app.post("/api/relay/join", async (req, res) => {
  try {
    const channel = String(req.body?.channel || "").trim();
    const memberId = String(req.body?.memberId || "").trim();
    const username = String(req.body?.username || "Player").trim().slice(0, 32);
    if (!channel || !memberId) return res.status(400).json({ error: "channel and memberId required" });
    if (hasTursoConfig()) {
      const resData = await tursoRelayJoin(channel, memberId, username);
      return res.json({ success: true, channel, memberId, ...resData });
    }
    let memMap = httpRelayMembers.get(channel);
    if (!memMap) {
      memMap = /* @__PURE__ */ new Map();
      httpRelayMembers.set(channel, memMap);
    }
    memMap.set(memberId, { memberId, username, lastSeen: Date.now() });
    const evList = httpRelayEvents.get(channel) || [];
    const afterId = evList.length > 0 ? evList[evList.length - 1].id : 0;
    evList.push({ id: httpRelaySeq++, fromMemberId: memberId, username, event: "relay_member_joined", payload: { memberId, username }, includeSelf: false, createdAt: Date.now() });
    httpRelayEvents.set(channel, evList.slice(-150));
    return res.json({ success: true, channel, memberId, members: Array.from(memMap.values()), afterId });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u30EA\u30EC\u30FC\u53C2\u52A0\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
app.post("/api/relay/send", async (req, res) => {
  try {
    const channel = String(req.body?.channel || "").trim();
    const memberId = String(req.body?.memberId || "").trim();
    const username = String(req.body?.username || "Player").trim().slice(0, 32);
    const event = String(req.body?.event || "").trim();
    const payload = req.body?.payload ?? {};
    const includeSelf = Boolean(req.body?.includeSelf);
    if (!channel || !memberId || !event) return res.status(400).json({ error: "Missing relay fields" });
    if (hasTursoConfig()) {
      const id2 = await tursoRelaySend(channel, memberId, username, event, payload, includeSelf);
      return res.json({ success: true, id: id2 });
    }
    const evList = httpRelayEvents.get(channel) || [];
    const id = httpRelaySeq++;
    evList.push({ id, fromMemberId: memberId, username, event, payload, includeSelf, createdAt: Date.now() });
    httpRelayEvents.set(channel, evList.slice(-150));
    const wsMembers = relayChannels.get(channel);
    if (wsMembers) {
      const msg = JSON.stringify({ type: "relay_event", channel, event, payload, fromMemberId: memberId });
      wsMembers.forEach((client) => {
        if (client.readyState === import_ws.WebSocket.OPEN) {
          try {
            client.send(msg);
          } catch {
          }
        }
      });
    }
    return res.json({ success: true, id });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u30EA\u30EC\u30FC\u9001\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
app.get("/api/relay/poll", async (req, res) => {
  try {
    const channel = String(req.query.channel || "").trim();
    const memberId = String(req.query.memberId || "").trim();
    const username = String(req.query.username || "Player").trim().slice(0, 32);
    const afterId = Number(req.query.afterId || 0) || 0;
    if (!channel || !memberId) return res.status(400).json({ error: "channel and memberId required" });
    if (hasTursoConfig()) {
      const polled = await tursoRelayPoll(channel, memberId, username, afterId);
      return res.json({ success: true, ...polled });
    }
    let memMap = httpRelayMembers.get(channel);
    if (!memMap) {
      memMap = /* @__PURE__ */ new Map();
      httpRelayMembers.set(channel, memMap);
    }
    memMap.set(memberId, { memberId, username, lastSeen: Date.now() });
    const now = Date.now();
    for (const [k, v] of memMap.entries()) {
      if (now - v.lastSeen > 25e3) memMap.delete(k);
    }
    const evList = httpRelayEvents.get(channel) || [];
    let latestId = afterId;
    const events = evList.filter((e) => {
      if (e.id <= afterId) return false;
      if (!e.includeSelf && e.fromMemberId === memberId) return false;
      if (e.id > latestId) latestId = e.id;
      return true;
    });
    return res.json({ success: true, events, members: Array.from(memMap.values()), latestId });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u30EA\u30EC\u30FC\u53D7\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
app.post("/api/relay/leave", async (req, res) => {
  try {
    const channel = String(req.body?.channel || "").trim();
    const memberId = String(req.body?.memberId || "").trim();
    const username = String(req.body?.username || "Player").trim().slice(0, 32);
    if (!channel || !memberId) return res.json({ success: true });
    if (hasTursoConfig()) {
      await tursoRelayLeave(channel, memberId, username);
      return res.json({ success: true });
    }
    httpRelayMembers.get(channel)?.delete(memberId);
    const evList = httpRelayEvents.get(channel) || [];
    evList.push({ id: httpRelaySeq++, fromMemberId: memberId, username, event: "relay_member_left", payload: { memberId, username }, includeSelf: false, createdAt: Date.now() });
    httpRelayEvents.set(channel, evList.slice(-150));
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u30EA\u30EC\u30FC\u9000\u51FA\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
setInterval(() => {
  try {
    if (hasTursoConfig()) {
      tursoPruneExpiredImages(true).catch(() => {
      });
    } else if (import_fs.default.existsSync(DB_FILE)) {
      readWeTalksDB();
    }
  } catch (e) {
  }
}, 60 * 60 * 1e3);
var tetrisQueue = [];
var tetrisRooms = {};
var server = import_http.default.createServer(app);
var PORT = 3e3;
var rooms = {};
var GRID_SIZE = 12;
var TILE_COLORS_COUNT = 5;
function createRandomGrid() {
  const grid = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    const row = [];
    for (let c = 0; c < GRID_SIZE; c++) {
      row.push(Math.floor(Math.random() * TILE_COLORS_COUNT));
    }
    grid.push(row);
  }
  return grid;
}
function getRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      roomId,
      players: {},
      grid: createRandomGrid(),
      flies: [],
      status: "waiting",
      timer: 90,
      seekerId: null,
      roundWinner: null
    };
    spawnFlies(rooms[roomId], 4);
  }
  return rooms[roomId];
}
function spawnFlies(room, count) {
  for (let i = 0; i < count; i++) {
    const gridX = Math.floor(Math.random() * GRID_SIZE);
    const gridY = Math.floor(Math.random() * GRID_SIZE);
    const flyId = Math.random().toString(36).substring(2, 9);
    room.flies.push({
      id: flyId,
      gridX,
      gridY,
      points: 10
    });
  }
}
function rotateGridColors(room) {
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (Math.random() < 0.15) {
        room.grid[r][c] = (room.grid[r][c] + Math.floor(Math.random() * (TILE_COLORS_COUNT - 1)) + 1) % TILE_COLORS_COUNT;
      }
    }
  }
  Object.values(room.players).forEach((p) => {
    const gx = Math.floor(p.x);
    const gy = Math.floor(p.y);
    if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE) {
      p.targetColorIndex = room.grid[gy][gx];
    }
  });
}
function simulateBots(room) {
  const playerIds = Object.keys(room.players);
  const activeBots = playerIds.filter((id) => room.players[id].isBot);
  const realPlayers = playerIds.filter((id) => !room.players[id].isBot);
  if (realPlayers.length > 0 && activeBots.length < 3) {
    const botId = `bot_${Math.random().toString(36).substring(2, 6)}`;
    room.players[botId] = {
      id: botId,
      name: `ChameleBot ${Math.floor(Math.random() * 90) + 10}`,
      x: Math.floor(Math.random() * (GRID_SIZE - 2)) + 1 + 0.5,
      y: Math.floor(Math.random() * (GRID_SIZE - 2)) + 1 + 0.5,
      colorIndex: 0,
      targetColorIndex: 0,
      role: "hider",
      isAlive: true,
      score: 0,
      skinId: Math.floor(Math.random() * 4),
      isBot: true,
      heading: 0
    };
  }
  if (room.status === "playing") {
    Object.values(room.players).forEach((p) => {
      if (!p.isBot || !p.isAlive) return;
      if (p.role === "hider") {
        if (Math.random() < 0.08) {
          const dx = (Math.random() - 0.5) * 0.4;
          const dy = (Math.random() - 0.5) * 0.4;
          p.x = Math.max(0.1, Math.min(GRID_SIZE - 0.1, p.x + dx));
          p.y = Math.max(0.1, Math.min(GRID_SIZE - 0.1, p.y + dy));
          p.heading = Math.atan2(dy, dx) * (180 / Math.PI);
        }
        const gx = Math.floor(p.x);
        const gy = Math.floor(p.y);
        if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE) {
          p.targetColorIndex = room.grid[gy][gx];
        }
      } else if (p.role === "seeker") {
        if (Math.random() < 0.03) {
          const hiders = Object.values(room.players).filter((pl) => pl.role === "hider" && pl.isAlive);
          if (hiders.length > 0) {
            const target = hiders[Math.floor(Math.random() * hiders.length)];
            const err = 1;
            const targetX = target.x + (Math.random() - 0.5) * err;
            const targetY = target.y + (Math.random() - 0.5) * err;
            const angle = Math.atan2(targetY - p.y, targetX - p.x);
            p.x = Math.max(0.1, Math.min(GRID_SIZE - 0.1, p.x + Math.cos(angle) * 0.3));
            p.y = Math.max(0.1, Math.min(GRID_SIZE - 0.1, p.y + Math.sin(angle) * 0.3));
            p.heading = angle * (180 / Math.PI);
            if (Math.random() < 0.25) {
              const lickRange = 1.5;
              hiders.forEach((hid) => {
                const dist = Math.hypot(hid.x - p.x, hid.y - p.y);
                if (dist <= lickRange) {
                  hid.isAlive = false;
                  p.score += 50;
                }
              });
            }
          }
        }
      }
    });
  }
}
setInterval(() => {
  Object.keys(rooms).forEach((roomId) => {
    const room = rooms[roomId];
    simulateBots(room);
    if (room.status === "playing") {
      room.timer--;
      if (room.timer % 6 === 0) {
        rotateGridColors(room);
      }
      room.flies.forEach((fly, index) => {
        Object.values(room.players).forEach((p) => {
          if (p.isAlive && p.role === "hider") {
            const dist = Math.hypot(p.x - (fly.gridX + 0.5), p.y - (fly.gridY + 0.5));
            if (dist < 0.6) {
              p.score += fly.points;
              room.flies.splice(index, 1);
              spawnFlies(room, 1);
            }
          }
        });
      });
      const seeker = Object.values(room.players).find((p) => p.role === "seeker");
      if (seeker) {
        Object.values(room.players).forEach((hider) => {
          if (hider.role === "hider" && hider.isAlive) {
            const dist = Math.hypot(hider.x - seeker.x, hider.y - seeker.y);
            if (dist < 0.5) {
              hider.isAlive = false;
              seeker.score += 50;
            }
          }
        });
      }
      const aliveHiders = Object.values(room.players).filter((p) => p.role === "hider" && p.isAlive);
      if (aliveHiders.length === 0) {
        room.status = "ended";
        room.roundWinner = "seeker";
      } else if (room.timer <= 0) {
        room.status = "ended";
        room.roundWinner = "hiders";
      }
    }
  });
}, 1e3);
var wss = new import_ws.WebSocketServer({ noServer: true });
var wsMetaMap = /* @__PURE__ */ new WeakMap();
var relayChannels = /* @__PURE__ */ new Map();
var wetalksWsClients = /* @__PURE__ */ new Set();
var wetalksCallRooms = /* @__PURE__ */ new Map();
function getWetalksCallParticipants(roomId) {
  const peers = wetalksCallRooms.get(roomId);
  if (!peers) return [];
  return Array.from(peers.values()).map((p) => ({
    peerId: p.peerId,
    username: p.username,
    camOn: p.camOn,
    micOn: p.micOn
  }));
}
function broadcastWetalksCallRoster(roomId) {
  if (!roomId) return;
  const participants = getWetalksCallParticipants(roomId);
  const payload = JSON.stringify({
    type: "wetalks_call_roster",
    roomId,
    participants
  });
  wetalksWsClients.forEach((client) => {
    if (client.readyState === import_ws.WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch {
      }
    }
  });
  const roomPeers = wetalksCallRooms.get(roomId);
  if (roomPeers) {
    roomPeers.forEach((p) => {
      if (!wetalksWsClients.has(p.ws) && p.ws.readyState === import_ws.WebSocket.OPEN) {
        try {
          p.ws.send(payload);
        } catch {
        }
      }
    });
  }
}
function leaveWetalksCall(ws, targetRoomId) {
  const meta = wsMetaMap.get(ws);
  if (!meta) return;
  const roomId = targetRoomId || meta.wetalksCallRoomId;
  const peerId = meta.wetalksCallPeerId;
  if (!roomId || !peerId) return;
  const peers = wetalksCallRooms.get(roomId);
  if (peers) {
    const existing = peers.get(peerId);
    if (!existing || existing.ws === ws) {
      peers.delete(peerId);
      const leavePayload = JSON.stringify({
        type: "wetalks_call_peer_left",
        roomId,
        peerId
      });
      peers.forEach((p) => {
        if (p.ws.readyState === import_ws.WebSocket.OPEN) {
          try {
            p.ws.send(leavePayload);
          } catch {
          }
        }
      });
      if (peers.size === 0) {
        wetalksCallRooms.delete(roomId);
      }
      broadcastWetalksCallRoster(roomId);
    }
  }
  if (meta.wetalksCallRoomId === roomId) {
    meta.wetalksCallRoomId = void 0;
    meta.wetalksCallPeerId = void 0;
  }
}
var expressSyncWaiters = /* @__PURE__ */ new Set();
function notifyExpressSyncWaiters(kind, roomId = "") {
  for (const w of Array.from(expressSyncWaiters)) {
    try {
      w({ kind, roomId });
    } catch {
    }
  }
}
function waitExpressSyncWakeup(ms, targetRoomId = "") {
  if (ms <= 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const onEvent = (evt) => {
      if (settled) return;
      if (evt.kind === "read" && targetRoomId && evt.roomId && evt.roomId !== targetRoomId) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      expressSyncWaiters.delete(onEvent);
      resolve(evt);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      expressSyncWaiters.delete(onEvent);
      resolve(null);
    }, ms);
    expressSyncWaiters.add(onEvent);
  });
}
function broadcastWetalksEvent(event, roomId, meta) {
  notifyExpressSyncWaiters(event, roomId);
  if (!roomId || wetalksWsClients.size === 0) return;
  const membersList = Array.isArray(meta?.members) && meta.members.length > 0 ? meta.members : null;
  const memberSet = membersList ? new Set(membersList) : null;
  const basePayload = JSON.stringify({ type: "wetalks_event", event, roomId });
  const richPayload = event === "message" && meta?.message && memberSet ? JSON.stringify({
    type: "wetalks_event",
    event,
    roomId,
    message: meta.message,
    roomName: meta.roomName || "",
    members: membersList
  }) : basePayload;
  wetalksWsClients.forEach((client) => {
    if (client.readyState !== import_ws.WebSocket.OPEN) return;
    const cMeta = wsMetaMap.get(client);
    if (memberSet) {
      if (!cMeta?.wetalksUsername || !memberSet.has(cMeta.wetalksUsername)) {
        return;
      }
      try {
        client.send(richPayload);
      } catch {
      }
      return;
    }
    try {
      client.send(basePayload);
    } catch {
    }
  });
}
function leaveRelayChannel(ws, targetChannel) {
  const meta = wsMetaMap.get(ws);
  if (!meta) return;
  const channel = targetChannel || meta.relayChannel;
  if (!channel) return;
  const members = relayChannels.get(channel);
  if (members) {
    members.delete(ws);
    const leavePayload = JSON.stringify({
      type: "relay_member_left",
      channel,
      memberId: meta.relayMemberId || meta.clientId,
      username: meta.relayUsername || "Player"
    });
    members.forEach((client) => {
      if (client.readyState === import_ws.WebSocket.OPEN) {
        client.send(leavePayload);
      }
    });
    if (members.size === 0) {
      relayChannels.delete(channel);
    }
  }
  if (meta.relayChannel === channel) {
    meta.relayChannel = void 0;
  }
}
server.on("upgrade", (request, socket, head) => {
  const protocol = request.headers["sec-websocket-protocol"];
  if (protocol === "vite-hmr" || protocol === "vite-ping") {
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});
wss.on("connection", (ws) => {
  let playerRoomId = "";
  const playerId = Math.random().toString(36).substring(2, 9);
  wsMetaMap.set(ws, { clientId: playerId });
  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      const meta = wsMetaMap.get(ws) || { clientId: playerId };
      wsMetaMap.set(ws, meta);
      switch (data.type) {
        case "ping": {
          ws.send(JSON.stringify({ type: "pong" }));
          break;
        }
        case "wetalks_subscribe": {
          const uname = typeof data.username === "string" ? data.username.trim().slice(0, 64) : "";
          meta.wetalksUsername = uname && uname !== "\u30B2\u30B9\u30C8" ? uname : void 0;
          wetalksWsClients.add(ws);
          break;
        }
        case "wetalks_notify_message": {
          const roomId = typeof data.roomId === "string" ? data.roomId.trim().slice(0, 120) : "";
          if (!roomId || !data.message || typeof data.message !== "object") break;
          const rawMsg = data.message;
          const msgId = typeof rawMsg.id === "string" ? rawMsg.id.trim().slice(0, 120) : "";
          const rawSender = typeof rawMsg.sender === "string" ? rawMsg.sender.trim().slice(0, 64) : "";
          const sender = meta.wetalksUsername || rawSender;
          if (!msgId || !sender || sender === "\u30B2\u30B9\u30C8") break;
          if (meta.wetalksUsername && rawSender && rawSender !== meta.wetalksUsername) break;
          const text = typeof rawMsg.text === "string" ? rawMsg.text.trim().slice(0, 300) : "";
          const hasImage = Boolean(rawMsg.has_image);
          if (!text && !hasImage) break;
          const createdAt = typeof rawMsg.created_at === "string" ? rawMsg.created_at.slice(0, 40) : (/* @__PURE__ */ new Date()).toISOString();
          const roomName = typeof data.roomName === "string" ? data.roomName.trim().slice(0, 100) : "";
          let members;
          if (Array.isArray(data.members)) {
            const cleaned = data.members.filter((m) => typeof m === "string").map((m) => m.trim().slice(0, 64)).filter((m) => Boolean(m) && m !== "\u30B2\u30B9\u30C8").slice(0, 50);
            if (cleaned.length > 0 && cleaned.includes(sender)) {
              members = cleaned;
            }
          }
          broadcastWetalksEvent("message", roomId, {
            message: { id: msgId, room_id: roomId, sender, text, has_image: hasImage, created_at: createdAt },
            roomName,
            members
          });
          break;
        }
        case "wetalks_call_probe": {
          const roomId = String(data.roomId || "").trim();
          if (!roomId) break;
          wetalksWsClients.add(ws);
          ws.send(
            JSON.stringify({
              type: "wetalks_call_roster",
              roomId,
              participants: getWetalksCallParticipants(roomId)
            })
          );
          break;
        }
        case "wetalks_call_join": {
          const roomId = String(data.roomId || "").trim();
          if (!roomId) break;
          const peerId = String(data.peerId || playerId).trim();
          const username = String(data.username || meta.wetalksUsername || "User").slice(0, 32);
          const camOn = Boolean(data.camOn);
          const micOn = data.micOn !== false;
          if (meta.wetalksCallRoomId && meta.wetalksCallRoomId !== roomId) {
            leaveWetalksCall(ws, meta.wetalksCallRoomId);
          }
          meta.wetalksCallRoomId = roomId;
          meta.wetalksCallPeerId = peerId;
          wetalksWsClients.add(ws);
          let peers = wetalksCallRooms.get(roomId);
          if (!peers) {
            peers = /* @__PURE__ */ new Map();
            wetalksCallRooms.set(roomId, peers);
          }
          const peerEntry = { peerId, username, camOn, micOn, ws };
          peers.set(peerId, peerEntry);
          ws.send(
            JSON.stringify({
              type: "wetalks_call_joined",
              roomId,
              peerId,
              participants: getWetalksCallParticipants(roomId)
            })
          );
          const joinedNotify = JSON.stringify({
            type: "wetalks_call_peer_joined",
            roomId,
            peer: { peerId, username, camOn, micOn }
          });
          peers.forEach((p) => {
            if (p.peerId !== peerId && p.ws.readyState === import_ws.WebSocket.OPEN) {
              try {
                p.ws.send(joinedNotify);
              } catch {
              }
            }
          });
          broadcastWetalksCallRoster(roomId);
          break;
        }
        case "wetalks_call_signal": {
          const roomId = String(data.roomId || meta.wetalksCallRoomId || "").trim();
          const targetPeerId = String(data.targetPeerId || "").trim();
          const fromPeerId = String(meta.wetalksCallPeerId || data.fromPeerId || "").trim();
          if (!roomId || !targetPeerId || !fromPeerId || !data.signal) break;
          const peers = wetalksCallRooms.get(roomId);
          const target = peers?.get(targetPeerId);
          if (target && target.ws.readyState === import_ws.WebSocket.OPEN) {
            try {
              target.ws.send(
                JSON.stringify({
                  type: "wetalks_call_signal",
                  roomId,
                  fromPeerId,
                  signal: data.signal
                })
              );
            } catch {
            }
          }
          break;
        }
        case "wetalks_call_media_state": {
          const roomId = String(data.roomId || meta.wetalksCallRoomId || "").trim();
          const peerId = String(meta.wetalksCallPeerId || data.peerId || "").trim();
          if (!roomId || !peerId) break;
          const peers = wetalksCallRooms.get(roomId);
          const peer = peers?.get(peerId);
          if (!peer) break;
          peer.camOn = Boolean(data.camOn);
          peer.micOn = data.micOn !== false;
          const stateMsg = JSON.stringify({
            type: "wetalks_call_media_state",
            roomId,
            peerId,
            camOn: peer.camOn,
            micOn: peer.micOn
          });
          peers.forEach((p) => {
            if (p.peerId !== peerId && p.ws.readyState === import_ws.WebSocket.OPEN) {
              try {
                p.ws.send(stateMsg);
              } catch {
              }
            }
          });
          broadcastWetalksCallRoster(roomId);
          break;
        }
        case "wetalks_call_audio": {
          const roomId = String(data.roomId || meta.wetalksCallRoomId || "").trim();
          const fromPeerId = String(meta.wetalksCallPeerId || data.fromPeerId || "").trim();
          const targetPeerId = typeof data.targetPeerId === "string" ? data.targetPeerId.trim() : "";
          const pcm = typeof data.pcm === "string" ? data.pcm : "";
          const sampleRate = Number(data.sampleRate) || 32e3;
          if (!roomId || !fromPeerId || !pcm || pcm.length > 32768) break;
          if (sampleRate < 8e3 || sampleRate > 48e3) break;
          const peers = wetalksCallRooms.get(roomId);
          if (!peers || !peers.has(fromPeerId)) break;
          const audioMsg = JSON.stringify({
            type: "wetalks_call_audio",
            roomId,
            fromPeerId,
            sampleRate,
            pcm
          });
          if (targetPeerId) {
            const target = peers.get(targetPeerId);
            if (target && target.peerId !== fromPeerId && target.ws.readyState === import_ws.WebSocket.OPEN) {
              try {
                target.ws.send(audioMsg);
              } catch {
              }
            }
          } else {
            peers.forEach((p) => {
              if (p.peerId !== fromPeerId && p.ws.readyState === import_ws.WebSocket.OPEN) {
                try {
                  p.ws.send(audioMsg);
                } catch {
                }
              }
            });
          }
          break;
        }
        case "wetalks_call_need_ws_audio": {
          const roomId = String(data.roomId || meta.wetalksCallRoomId || "").trim();
          const fromPeerId = String(meta.wetalksCallPeerId || data.fromPeerId || "").trim();
          const targetPeerId = typeof data.targetPeerId === "string" ? data.targetPeerId.trim() : "";
          if (!roomId || !fromPeerId || !targetPeerId) break;
          const peers = wetalksCallRooms.get(roomId);
          if (!peers || !peers.has(fromPeerId)) break;
          const target = peers.get(targetPeerId);
          if (target && target.peerId !== fromPeerId && target.ws.readyState === import_ws.WebSocket.OPEN) {
            try {
              target.ws.send(JSON.stringify({
                type: "wetalks_call_need_ws_audio",
                roomId,
                fromPeerId
              }));
            } catch {
            }
          }
          break;
        }
        case "wetalks_call_leave": {
          const roomId = data.roomId ? String(data.roomId).trim() : void 0;
          leaveWetalksCall(ws, roomId);
          break;
        }
        case "relay_join": {
          const channel = String(data.channel || "").trim();
          if (!channel) break;
          if (meta.relayChannel && meta.relayChannel !== channel) {
            leaveRelayChannel(ws, meta.relayChannel);
          }
          meta.relayChannel = channel;
          meta.relayMemberId = String(data.memberId || playerId);
          meta.relayUsername = String(data.username || "Player");
          let members = relayChannels.get(channel);
          if (!members) {
            members = /* @__PURE__ */ new Set();
            relayChannels.set(channel, members);
          }
          members.add(ws);
          const memberList = Array.from(members).map((client) => {
            const cm = wsMetaMap.get(client);
            return {
              memberId: cm?.relayMemberId || cm?.clientId || "",
              username: cm?.relayUsername || "Player"
            };
          }).filter((m) => !!m.memberId);
          ws.send(
            JSON.stringify({
              type: "relay_joined",
              channel,
              memberId: meta.relayMemberId,
              members: memberList
            })
          );
          const joinNotify = JSON.stringify({
            type: "relay_member_joined",
            channel,
            memberId: meta.relayMemberId,
            username: meta.relayUsername
          });
          members.forEach((client) => {
            if (client !== ws && client.readyState === import_ws.WebSocket.OPEN) {
              client.send(joinNotify);
            }
          });
          break;
        }
        case "relay_broadcast": {
          const channel = String(data.channel || meta.relayChannel || "").trim();
          if (!channel || !data.event) break;
          const members = relayChannels.get(channel);
          if (!members) break;
          const out = JSON.stringify({
            type: "relay_event",
            channel,
            event: data.event,
            payload: data.payload ?? {},
            fromMemberId: meta.relayMemberId || playerId
          });
          members.forEach((client) => {
            if (client.readyState === import_ws.WebSocket.OPEN && (data.includeSelf || client !== ws)) {
              client.send(out);
            }
          });
          break;
        }
        case "relay_leave": {
          leaveRelayChannel(ws, data.channel ? String(data.channel).trim() : void 0);
          break;
        }
        case "join": {
          playerRoomId = String(data.roomId || "default").trim().toLowerCase() || "default";
          meta.chameleonRoomId = playerRoomId;
          const currentRoom = getRoom(playerRoomId);
          const hasSeeker = Object.values(currentRoom.players).some((p) => p.role === "seeker");
          const role = hasSeeker ? "hider" : "seeker";
          const px = Math.floor(Math.random() * (GRID_SIZE - 2)) + 1 + 0.5;
          const py = Math.floor(Math.random() * (GRID_SIZE - 2)) + 1 + 0.5;
          const tileColor = currentRoom.grid[Math.floor(py)][Math.floor(px)] ?? 0;
          currentRoom.players[playerId] = {
            id: playerId,
            name: data.name || `Chameleon_${playerId}`,
            x: px,
            y: py,
            colorIndex: 0,
            targetColorIndex: tileColor,
            role,
            isAlive: true,
            score: 0,
            skinId: data.skinId || 0,
            isBot: false,
            heading: 0
          };
          if (role === "seeker") {
            currentRoom.seekerId = playerId;
          }
          ws.send(JSON.stringify({
            type: "init",
            playerId,
            roomId: playerRoomId,
            gameState: currentRoom
          }));
          break;
        }
        case "move": {
          if (!playerRoomId) break;
          const room = getRoom(playerRoomId);
          const player = room.players[playerId];
          if (player && player.isAlive) {
            player.x = Math.max(0.1, Math.min(GRID_SIZE - 0.1, data.x));
            player.y = Math.max(0.1, Math.min(GRID_SIZE - 0.1, data.y));
            player.heading = data.heading || 0;
            const gx = Math.floor(player.x);
            const gy = Math.floor(player.y);
            if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE) {
              player.targetColorIndex = room.grid[gy][gx];
            }
          }
          break;
        }
        case "lick": {
          if (!playerRoomId) break;
          const room = getRoom(playerRoomId);
          const player = room.players[playerId];
          if (player && player.role === "seeker") {
            const lickRange = 1.8;
            Object.values(room.players).forEach((hid) => {
              if (hid.role === "hider" && hid.isAlive) {
                const dist = Math.hypot(hid.x - player.x, hid.y - player.y);
                if (dist <= lickRange) {
                  hid.isAlive = false;
                  player.score += 50;
                }
              }
            });
            broadcastToRoom(playerRoomId, {
              type: "lick_effect",
              seekerId: playerId,
              x: player.x,
              y: player.y,
              heading: player.heading
            });
          }
          break;
        }
        case "skin_change": {
          if (!playerRoomId) break;
          const room = getRoom(playerRoomId);
          const player = room.players[playerId];
          if (player) {
            player.skinId = data.skinId;
          }
          break;
        }
        case "start_game": {
          if (!playerRoomId) break;
          const room = getRoom(playerRoomId);
          if (room.status !== "playing") {
            room.status = "playing";
            room.timer = 90;
            room.flies = [];
            room.roundWinner = null;
            spawnFlies(room, 4);
            const playerIds = Object.keys(room.players);
            if (playerIds.length > 0) {
              const seekerIndex = Math.floor(Math.random() * playerIds.length);
              playerIds.forEach((id, idx) => {
                const nx = Math.floor(Math.random() * (GRID_SIZE - 2)) + 1 + 0.5;
                const ny = Math.floor(Math.random() * (GRID_SIZE - 2)) + 1 + 0.5;
                room.players[id].role = idx === seekerIndex ? "seeker" : "hider";
                room.players[id].isAlive = true;
                room.players[id].x = nx;
                room.players[id].y = ny;
                room.players[id].targetColorIndex = room.grid[Math.floor(ny)][Math.floor(nx)] ?? 0;
              });
              room.seekerId = playerIds[seekerIndex];
            }
            broadcastToRoom(playerRoomId, {
              type: "system",
              text: "The hunt has started! Chameleon hiders, camouflage into the tiles!"
            });
          }
          break;
        }
        case "chat": {
          if (!playerRoomId) break;
          const room = getRoom(playerRoomId);
          broadcastToRoom(playerRoomId, {
            type: "chat",
            sender: room.players[playerId]?.name || "Chameleon",
            text: data.text
          });
          break;
        }
        case "tetris_join": {
          const clientName = data.name || "Anonymous Player";
          const newClient = {
            id: playerId,
            name: clientName,
            ws
          };
          const existingIdx = tetrisQueue.findIndex((c) => c.id === playerId);
          if (existingIdx !== -1) {
            tetrisQueue[existingIdx] = newClient;
          } else if (tetrisQueue.length > 0) {
            const opp = tetrisQueue.shift();
            if (opp.id === playerId) {
              tetrisQueue.push(newClient);
              ws.send(JSON.stringify({ type: "tetris_waiting" }));
            } else {
              const rId = "t_room_" + Math.random().toString(36).substr(2, 6);
              const room = {
                id: rId,
                player1: opp,
                player2: newClient
              };
              tetrisRooms[rId] = room;
              opp.ws.send(JSON.stringify({
                type: "tetris_matched",
                roomId: rId,
                opponentName: newClient.name
              }));
              ws.send(JSON.stringify({
                type: "tetris_matched",
                roomId: rId,
                opponentName: opp.name
              }));
            }
          } else {
            tetrisQueue.push(newClient);
            ws.send(JSON.stringify({ type: "tetris_waiting" }));
          }
          break;
        }
        case "tetris_sync_grid": {
          const rId = data.roomId;
          const room = tetrisRooms[rId];
          if (room) {
            const isP1 = room.player1.id === playerId;
            const opp = isP1 ? room.player2 : room.player1;
            opp.ws.send(JSON.stringify({
              type: "tetris_sync_grid",
              grid: data.grid,
              score: data.score
            }));
          }
          break;
        }
        case "tetris_send_garbage": {
          const rId = data.roomId;
          const room = tetrisRooms[rId];
          if (room) {
            const isP1 = room.player1.id === playerId;
            const opp = isP1 ? room.player2 : room.player1;
            opp.ws.send(JSON.stringify({
              type: "tetris_opponent_garbage",
              lines: data.lines
            }));
          }
          break;
        }
        case "tetris_gameover": {
          const rId = data.roomId;
          const room = tetrisRooms[rId];
          if (room) {
            const isP1 = room.player1.id === playerId;
            const opp = isP1 ? room.player2 : room.player1;
            opp.ws.send(JSON.stringify({
              type: "tetris_opponent_gameover"
            }));
          }
          break;
        }
        // ─── GeoGuessr Online Multiplayer Handlers ───
        case "geo_queue_join": {
          removePlayerFromGeoQueue(playerId);
          leavePlayerGeoRoom(playerId);
          const format = data.format === "classic5" ? "classic5" : "duels";
          const mapId = GEOGUESSR_MAPS[data.mapId] ? data.mapId : "world";
          const moveMode = data.moveMode === "nomove" || data.moveMode === "nmpz" ? data.moveMode : "moving";
          const roundTimeSec = typeof data.roundTimeSec === "number" ? data.roundTimeSec : 90;
          const playerName = String(data.name || `Explorer_${playerId.slice(0, 4)}`).slice(0, 24);
          const opponentIdx = geoQueue.findIndex((q) => q.format === format && q.id !== playerId);
          if (opponentIdx !== -1) {
            const opponent = geoQueue.splice(opponentIdx, 1)[0];
            const roomCode = generateGeoRoomCode();
            const room = {
              roomCode,
              hostId: opponent.id,
              format,
              mapId: opponent.mapId,
              moveMode: opponent.moveMode,
              roundTimeSec: opponent.roundTimeSec,
              status: "lobby",
              currentRound: 1,
              maxRounds: format === "classic5" ? 5 : 99,
              target: { lat: 0, lng: 0, heading: 0 },
              roundStartedAt: null,
              roundDeadlineAt: null,
              countdownEndAt: null,
              winnerId: null,
              players: [
                {
                  id: opponent.id,
                  name: opponent.name,
                  ws: opponent.ws,
                  hp: 6e3,
                  totalScore: 0,
                  guess: null,
                  softPin: null,
                  guessedAt: null,
                  readyForNext: false,
                  wantsRematch: false,
                  connected: true
                },
                {
                  id: playerId,
                  name: playerName,
                  ws,
                  hp: 6e3,
                  totalScore: 0,
                  guess: null,
                  softPin: null,
                  guessedAt: null,
                  readyForNext: false,
                  wantsRematch: false,
                  connected: true
                }
              ],
              history: [],
              createdAt: Date.now()
            };
            geoRooms.set(roomCode, room);
            startGeoRound(room, 1);
          } else {
            geoQueue.push({
              id: playerId,
              name: playerName,
              ws,
              format,
              mapId,
              moveMode,
              roundTimeSec,
              joinedAt: Date.now()
            });
            ws.send(
              JSON.stringify({
                type: "geo_queue_waiting",
                format,
                waitingCount: geoQueue.length
              })
            );
          }
          break;
        }
        case "geo_queue_leave": {
          removePlayerFromGeoQueue(playerId);
          ws.send(JSON.stringify({ type: "geo_queue_cancelled" }));
          break;
        }
        case "geo_room_create": {
          removePlayerFromGeoQueue(playerId);
          leavePlayerGeoRoom(playerId);
          const format = data.format === "classic5" ? "classic5" : "duels";
          const mapId = GEOGUESSR_MAPS[data.mapId] ? data.mapId : "world";
          const moveMode = data.moveMode === "nomove" || data.moveMode === "nmpz" ? data.moveMode : "moving";
          const roundTimeSec = typeof data.roundTimeSec === "number" ? data.roundTimeSec : 90;
          const playerName = String(data.name || `Host_${playerId.slice(0, 4)}`).slice(0, 24);
          const roomCode = generateGeoRoomCode();
          const room = {
            roomCode,
            hostId: playerId,
            format,
            mapId,
            moveMode,
            roundTimeSec,
            status: "lobby",
            currentRound: 1,
            maxRounds: format === "classic5" ? 5 : 99,
            target: { lat: 0, lng: 0, heading: 0 },
            roundStartedAt: null,
            roundDeadlineAt: null,
            countdownEndAt: null,
            winnerId: null,
            players: [
              {
                id: playerId,
                name: playerName,
                ws,
                hp: 6e3,
                totalScore: 0,
                guess: null,
                softPin: null,
                guessedAt: null,
                readyForNext: false,
                wantsRematch: false,
                connected: true
              }
            ],
            history: [],
            createdAt: Date.now()
          };
          geoRooms.set(roomCode, room);
          broadcastGeoRoom(room);
          break;
        }
        case "geo_room_join": {
          const code = String(data.roomCode || "").trim().toUpperCase();
          const room = geoRooms.get(code);
          if (!room) {
            ws.send(JSON.stringify({ type: "geo_error", message: "\u30EB\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002\u30B3\u30FC\u30C9\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002" }));
            break;
          }
          if (room.players.length >= 2) {
            ws.send(JSON.stringify({ type: "geo_error", message: "\u3053\u306E\u30EB\u30FC\u30E0\u306F\u6E80\u54E1\u3067\u3059\u3002" }));
            break;
          }
          if (room.status !== "lobby") {
            ws.send(JSON.stringify({ type: "geo_error", message: "\u3053\u306E\u30EB\u30FC\u30E0\u306F\u3059\u3067\u306B\u5BFE\u6226\u4E2D\u3067\u3059\u3002" }));
            break;
          }
          removePlayerFromGeoQueue(playerId);
          leavePlayerGeoRoom(playerId);
          const playerName = String(data.name || `Guest_${playerId.slice(0, 4)}`).slice(0, 24);
          room.players.push({
            id: playerId,
            name: playerName,
            ws,
            hp: 6e3,
            totalScore: 0,
            guess: null,
            softPin: null,
            guessedAt: null,
            readyForNext: false,
            wantsRematch: false,
            connected: true
          });
          broadcastGeoRoom(room);
          break;
        }
        case "geo_room_update_settings": {
          const code = String(data.roomCode || "").trim().toUpperCase();
          const room = geoRooms.get(code);
          if (!room || room.hostId !== playerId || room.status !== "lobby") break;
          if (data.format === "duels" || data.format === "classic5") {
            room.format = data.format;
            room.maxRounds = data.format === "classic5" ? 5 : 99;
          }
          if (GEOGUESSR_MAPS[data.mapId]) room.mapId = data.mapId;
          if (data.moveMode === "moving" || data.moveMode === "nomove" || data.moveMode === "nmpz") {
            room.moveMode = data.moveMode;
          }
          if (typeof data.roundTimeSec === "number") room.roundTimeSec = data.roundTimeSec;
          broadcastGeoRoom(room);
          break;
        }
        case "geo_room_start": {
          const code = String(data.roomCode || "").trim().toUpperCase();
          const room = geoRooms.get(code);
          if (!room || room.hostId !== playerId || room.players.length < 2) break;
          room.players.forEach((p) => {
            p.hp = 6e3;
            p.totalScore = 0;
          });
          room.history = [];
          room.winnerId = null;
          startGeoRound(room, 1);
          break;
        }
        case "geo_pano_verified": {
          const code = String(data.roomCode || "").trim().toUpperCase();
          const room = geoRooms.get(code);
          if (!room || room.status !== "playing" || room.currentRound !== data.roundNumber) break;
          if (!room.target.panoId && data.actual && typeof data.actual.lat === "number" && typeof data.actual.lng === "number") {
            room.target = {
              lat: data.actual.lat,
              lng: data.actual.lng,
              heading: room.target.heading,
              panoId: data.actual.panoId ? String(data.actual.panoId) : void 0,
              locationLabel: data.actual.locationLabel ? String(data.actual.locationLabel) : void 0
            };
            broadcastGeoRoom(room);
          } else if (!room.target.locationLabel && data.actual?.locationLabel) {
            room.target.locationLabel = String(data.actual.locationLabel);
          }
          break;
        }
        case "geo_guess_pin": {
          const code = String(data.roomCode || "").trim().toUpperCase();
          const room = geoRooms.get(code);
          if (!room || room.status !== "playing") break;
          const player = room.players.find((p) => p.id === playerId);
          if (!player || player.guess) break;
          if (typeof data.lat === "number" && typeof data.lng === "number") {
            player.softPin = { lat: data.lat, lng: data.lng };
          }
          break;
        }
        case "geo_guess_submit": {
          const code = String(data.roomCode || "").trim().toUpperCase();
          const room = geoRooms.get(code);
          if (!room || room.status !== "playing") break;
          const player = room.players.find((p) => p.id === playerId);
          if (!player || player.guess) break;
          if (typeof data.lat !== "number" || typeof data.lng !== "number") break;
          player.guess = { lat: data.lat, lng: data.lng };
          player.softPin = player.guess;
          player.guessedAt = Date.now();
          const allGuessed = room.players.every((p) => p.guess !== null);
          if (allGuessed) {
            resolveGeoRound(room);
          } else {
            const pressureEnd = Date.now() + 15e3;
            room.countdownEndAt = room.countdownEndAt ? Math.min(room.countdownEndAt, pressureEnd) : pressureEnd;
            broadcastGeoRoom(room);
          }
          break;
        }
        case "geo_next_round": {
          const code = String(data.roomCode || "").trim().toUpperCase();
          const room = geoRooms.get(code);
          if (!room || room.status !== "round_result") break;
          const player = room.players.find((p) => p.id === playerId);
          if (!player) break;
          player.readyForNext = true;
          if (room.players.every((p) => p.readyForNext)) {
            startGeoRound(room, room.currentRound + 1);
          } else {
            broadcastGeoRoom(room);
          }
          break;
        }
        case "geo_rematch": {
          const code = String(data.roomCode || "").trim().toUpperCase();
          const room = geoRooms.get(code);
          if (!room || room.status !== "match_over") break;
          const player = room.players.find((p) => p.id === playerId);
          if (!player) break;
          player.wantsRematch = true;
          if (room.players.length >= 2 && room.players.every((p) => p.wantsRematch)) {
            room.players.forEach((p) => {
              p.hp = 6e3;
              p.totalScore = 0;
              p.wantsRematch = false;
            });
            room.history = [];
            room.winnerId = null;
            startGeoRound(room, 1);
          } else {
            broadcastGeoRoom(room);
          }
          break;
        }
        case "geo_leave_room": {
          removePlayerFromGeoQueue(playerId);
          leavePlayerGeoRoom(playerId);
          break;
        }
      }
    } catch (err) {
      console.error("Error handling WebSocket message:", err);
    }
  });
  ws.on("close", () => {
    leaveWetalksCall(ws);
    wetalksWsClients.delete(ws);
    leaveRelayChannel(ws);
    removePlayerFromGeoQueue(playerId);
    leavePlayerGeoRoom(playerId);
    const queueIdx = tetrisQueue.findIndex((c) => c.id === playerId);
    if (queueIdx !== -1) {
      tetrisQueue.splice(queueIdx, 1);
    }
    Object.keys(tetrisRooms).forEach((rId) => {
      const room = tetrisRooms[rId];
      if (room.player1.id === playerId || room.player2.id === playerId) {
        const opp = room.player1.id === playerId ? room.player2 : room.player1;
        try {
          opp.ws.send(JSON.stringify({ type: "tetris_opponent_disconnected" }));
        } catch (e) {
        }
        delete tetrisRooms[rId];
      }
    });
    Object.keys(rooms).forEach((rId) => {
      const room = rooms[rId];
      if (room.players[playerId]) {
        delete room.players[playerId];
        if (room.seekerId === playerId) {
          const remainingIds = Object.keys(room.players);
          if (remainingIds.length > 0) {
            const nextSeeker = remainingIds[0];
            room.players[nextSeeker].role = "seeker";
            room.seekerId = nextSeeker;
          } else {
            room.seekerId = null;
          }
        }
        const hasRealPlayer = Object.values(room.players).some((p) => !p.isBot);
        if (!hasRealPlayer) {
          delete rooms[rId];
        }
      }
    });
  });
});
function broadcastToRoom(roomId, message) {
  const payload = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === import_ws.WebSocket.OPEN) {
      const meta = wsMetaMap.get(client);
      if (meta?.chameleonRoomId === roomId) {
        client.send(payload);
      }
    }
  });
}
function broadcastAllWs(message) {
  const payload = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === import_ws.WebSocket.OPEN) {
      client.send(payload);
    }
  });
}
setInterval(() => {
  Object.keys(rooms).forEach((roomId) => {
    const room = rooms[roomId];
    broadcastToRoom(roomId, {
      type: "state_update",
      gameState: room
    });
  });
}, 40);
var BROADCASTS_FILE = import_path.default.join(process.cwd(), "broadcasts_db.json");
function readBroadcasts() {
  try {
    if (import_fs.default.existsSync(BROADCASTS_FILE)) {
      const data = import_fs.default.readFileSync(BROADCASTS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Error reading broadcasts db:", e);
  }
  return [];
}
function writeBroadcasts(broadcasts) {
  try {
    import_fs.default.writeFileSync(BROADCASTS_FILE, JSON.stringify(broadcasts, null, 2), "utf-8");
  } catch (e) {
    console.error("Error writing broadcasts db:", e);
  }
}
app.get("/api/admin/broadcasts", async (_req, res) => {
  try {
    if (hasTursoConfig()) {
      const broadcasts2 = await tursoGetAdminBroadcasts();
      return res.json(broadcasts2);
    }
    const broadcasts = readBroadcasts();
    return res.json(broadcasts);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u30D6\u30ED\u30FC\u30C9\u30AD\u30E3\u30B9\u30C8\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
app.post("/api/admin/broadcasts", async (req, res) => {
  try {
    const { sender, title, text, kind, batFilename, batCode, autoRun, targetUser, senderClientId } = req.body || {};
    if (!title || !text && !batCode) {
      return res.status(400).json({ error: "Title and text/batCode are required" });
    }
    const newBroadcast = {
      id: "bc-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
      sender: sender || "\u7BA1\u7406\u8005 (Admin)",
      title,
      text: text || batCode || "",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      ...kind === "bat" ? {
        kind: "bat",
        batFilename: String(batFilename || title || "script.bat"),
        batCode: String(batCode || text || ""),
        autoRun: Boolean(autoRun)
      } : { kind: "docx" },
      ...targetUser ? { targetUser: String(targetUser) } : {},
      ...senderClientId ? { senderClientId: String(senderClientId) } : {}
    };
    if (hasTursoConfig()) {
      await tursoInsertAdminBroadcast(newBroadcast);
    } else {
      const broadcasts = readBroadcasts();
      broadcasts.push(newBroadcast);
      writeBroadcasts(broadcasts);
    }
    notifyExpressSyncWaiters("broadcast", "*");
    broadcastAllWs({
      type: "admin_broadcast",
      broadcast: newBroadcast
    });
    return res.json({ success: true, broadcast: newBroadcast });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "\u30D6\u30ED\u30FC\u30C9\u30AD\u30E3\u30B9\u30C8\u9001\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" });
  }
});
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", playersCount: wss.clients.size });
});
app.get("/api/geoguessr/config", (_req, res) => {
  res.json({ provider: "panoramax-osm", requiresKey: false });
});
function isPrivateOrDisallowedHost(hostname) {
  const h = hostname.toLowerCase().trim();
  if (!h || h === "localhost" || h === "::1" || h.endsWith(".local") || h.endsWith(".internal")) {
    return true;
  }
  if (/^127\.|^10\.|^192\.168\.|^0\.|^169\.254\./.test(h)) {
    return true;
  }
  const m172 = h.match(/^172\.(\d+)\./);
  if (m172) {
    const second = Number(m172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}
app.get("/api/custom-web/check", async (req, res) => {
  const rawUrl = String(req.query.url || "").trim();
  if (!rawUrl || rawUrl === "about:blank") {
    return res.json({ ok: false, status: 0, blocked: true, reason: "URL\u304C\u672A\u8A2D\u5B9A\u307E\u305F\u306F\u7121\u52B9\u3067\u3059\u3002" });
  }
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return res.json({ ok: false, status: 0, blocked: true, reason: "\u7121\u52B9\u306AURL\u5F62\u5F0F\u3067\u3059\u3002" });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return res.json({ ok: false, status: 0, blocked: true, reason: "HTTP/HTTPS \u306E\u307F\u5BFE\u5FDC\u3057\u3066\u3044\u307E\u3059\u3002" });
  }
  if (isPrivateOrDisallowedHost(parsed.hostname)) {
    return res.json({ ok: false, status: 0, blocked: true, reason: "\u30ED\u30FC\u30AB\u30EB/\u30D7\u30E9\u30A4\u30D9\u30FC\u30C8URL\u306F\u691C\u8A3C\u5BFE\u8C61\u5916\u3067\u3059\u3002" });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const resp = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AbordOS-CustomWebCheck/1.0)",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8"
      }
    });
    clearTimeout(timeout);
    try {
      await resp.body?.cancel();
    } catch {
    }
    const xfo = (resp.headers.get("x-frame-options") || "").toLowerCase();
    const csp = (resp.headers.get("content-security-policy") || "").toLowerCase();
    const frameAncestorsMatch = csp.match(/frame-ancestors\s+([^;]+)/i);
    const frameAncestors = frameAncestorsMatch ? frameAncestorsMatch[1].trim() : "";
    let blocked = false;
    let reason = "";
    if (resp.status >= 400) {
      blocked = true;
      reason = `\u30B5\u30FC\u30D0\u30FC\u304C\u30A8\u30E9\u30FC (HTTP ${resp.status}) \u3092\u8FD4\u3057\u307E\u3057\u305F\u3002`;
    } else if (xfo.includes("deny") || xfo.includes("sameorigin")) {
      blocked = true;
      reason = `\u3053\u306E\u30B5\u30A4\u30C8\u306F iframe \u57CB\u3081\u8FBC\u307F\u3092\u7981\u6B62\u3057\u3066\u3044\u307E\u3059 (X-Frame-Options: ${xfo})\u3002`;
    } else if (frameAncestors && (frameAncestors.includes("'none'") || frameAncestors === "'self'")) {
      blocked = true;
      reason = `\u3053\u306E\u30B5\u30A4\u30C8\u306F CSP (frame-ancestors) \u306B\u3088\u308A\u57CB\u3081\u8FBC\u307F\u3092\u7981\u6B62\u3057\u3066\u3044\u307E\u3059\u3002`;
    }
    return res.json({ ok: !blocked, status: resp.status, blocked, reason });
  } catch (err) {
    clearTimeout(timeout);
    const aborted = err?.name === "AbortError";
    return res.json({
      ok: false,
      status: 0,
      blocked: false,
      reason: aborted ? "\u5FDC\u7B54\u30BF\u30A4\u30E0\u30A2\u30A6\u30C8\uFF084.5\u79D2\uFF09" : "\u63A5\u7D9A\u78BA\u8A8D\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002"
    });
  }
});
var isProduction = process.env.NODE_ENV === "production";
async function startServer() {
  if (!isProduction) {
    const isHmrDisabled = process.env.DISABLE_HMR === "true";
    let viteServerRef = null;
    let viteInitError = null;
    const viteInitPromise = (async () => {
      const { createServer: createViteServer } = await import("vite");
      viteServerRef = await createViteServer({
        server: {
          middlewareMode: true,
          ...isHmrDisabled ? { hmr: false, ws: false } : { hmr: { server } }
        },
        appType: "spa"
      });
    })().catch((err) => {
      viteInitError = err;
      console.error("Failed to initialize Vite dev server:", err);
    });
    if (isHmrDisabled) {
      app.use(async (req, res, next) => {
        if (req.path === "/@vite/client" || req.path.endsWith("/@vite/client")) {
          await viteInitPromise;
          if (viteServerRef) {
            try {
              const result = await viteServerRef.transformRequest("/@vite/client");
              if (result) {
                const patchedCode = result.code.replace(
                  "transport.connect(createHMRHandler(handleMessage));",
                  "/* HMR disabled via DISABLE_HMR=true */"
                );
                res.setHeader("Content-Type", "application/javascript");
                return res.send(patchedCode);
              }
            } catch {
            }
          }
        }
        next();
      });
    }
    app.use(async (req, res, next) => {
      if (!viteServerRef) {
        await viteInitPromise;
      }
      if (viteServerRef) {
        return viteServerRef.middlewares(req, res, next);
      }
      if (viteInitError) {
        return res.status(500).send("Vite initialization failed");
      }
      next();
    });
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use("/noon-os", import_express.default.static(distPath));
    app.use(import_express.default.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map

import { Asset, requestPermissionsAsync } from 'expo-media-library';

import { toLocalIso } from './datetime';

// 사진 파일에 위치·시각이 없을 때 사진 보관함(Photos)에 기록된 값을 읽는다.
// 아이폰은 사진을 고를 때 '위치 포함'을 끄거나 공유받은 사진이면 파일에서 GPS 가 빠지지만,
// 보관함에는 남아 있는 경우가 많다. 권한을 거부하거나 읽지 못하면 null
export async function readLibraryInfo(assetId) {
  if (!assetId) return null;
  try {
    const { granted } = await requestPermissionsAsync(false, ['photo']);
    if (!granted) return null;
    const asset = new Asset(assetId);
    const [location, creationTime] = await Promise.all([asset.getLocation(), asset.getCreationTime()]);
    return {
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      taken_at: creationTime ? toLocalIso(new Date(creationTime)) : null,
    };
  } catch {
    return null;
  }
}

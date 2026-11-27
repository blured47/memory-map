import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import { getAssetContentUriAsync } from 'expo-media-library/legacy';

import { toLocalIso } from './datetime';

// ImagePicker 가 돌려주는 assetId 는 iOS 에서 "ph://" 접두사 없는 localIdentifier,
// Android 에서 MediaStore 숫자 ID 라서 expo-media-library 의 Asset 생성자가 요구하는 URI 로 맞춰 준다.
async function resolveAssetId(assetId) {
  if (Platform.OS === 'ios') {
    return assetId.startsWith('ph://') ? assetId : `ph://${assetId}`;
  }
  if (Platform.OS === 'android' && !assetId.startsWith('content://')) {
    return getAssetContentUriAsync(assetId);
  }
  return assetId;
}

// 사진 보관함에서 사진 한 장을 고른다. 취소하면 null.
// 위치 정보를 지키려고 편집·압축 없이 원본 그대로 고른다.
// iOS 는 Current 여야 HEIC 원본 파일이 오고, 기본값(Automatic)은 다시 인코딩하며 EXIF 를 잃는다
export async function pickPhotoFromLibrary() {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
  });
  return result.canceled ? null : result.assets[0];
}

// 사진 파일에 위치·시각이 없을 때 사진 보관함(Photos)에 기록된 값을 읽는다.
// 아이폰은 사진을 고를 때 '위치 포함'을 끄거나 공유받은 사진이면 파일에서 GPS 가 빠지지만,
// 보관함에는 남아 있는 경우가 많다. 권한을 거부하거나 읽지 못하면 null
export async function readLibraryInfo(assetId) {
  if (!assetId) return null;
  try {
    const { granted } = await requestPermissionsAsync(false, ['photo']);
    if (!granted) return null;
    const resolvedId = await resolveAssetId(assetId);
    const asset = new Asset(resolvedId);
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

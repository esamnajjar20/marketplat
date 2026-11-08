
export class Asset {
  static loadAsync = async () => [];
  static fromModule = () => new Asset();
  static fromURI = () => new Asset();
  downloadAsync = async () => undefined;
  localUri = 'file:///test-asset.png';
  uri = 'file:///test-asset.png';
}

export class MapFocus {
  public lng: number;
  public lat: number;
  public zoom: number;

  constructor(lng: number = 0, lat: number = 0, zoom: number = 1) {
    this.lng = lng;
    this.lat = lat;
    this.zoom = zoom;
  }
}

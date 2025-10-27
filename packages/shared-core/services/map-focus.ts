export class MapFocus {
  public lng: number;
  public lat: number;
  public zoom: number;

  constructor(lng: number, lat: number, zoom: number) {
    this.lng = lng;
    this.lat = lat;
    this.zoom = zoom;
  }
}

export class RunStart {
    constructor(position) {
        this.position = position;
    }
    setMarker(marker) {
        if (this.marker) {
            this.marker.remove();
        }
        this.marker = marker;
    }
}
export class CurrentRun {
    constructor(start) {
        this.start = start;
        this.distance = 0;
        this.segments = [];
    }
    addSegment(segment, marker) {
        segment.marker = marker;
        this.segments.push(segment);
        this.distance += segment.distance;
    }
    removeLastSegment() {
        const segment = this.segments.pop();
        if (segment) {
            this.distance -= segment.distance;
            if (segment.marker) {
                segment.marker.remove();
            }
        }
        return segment;
    }
    getLastPosition() {
        const lastSegment = this.segments[this.segments.length - 1];
        return lastSegment ? lastSegment.position : this.start.position;
    }
    getPoints() {
        return [this.start.position, ...this.segments.map(s => s.position)];
    }
}
//# sourceMappingURL=current-run.js.map
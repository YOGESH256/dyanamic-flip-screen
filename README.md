Features added : 

1. **Video Player Integration:**
   * **Static Media Content:** Implement a video player to display static media content (use a 16:9 aspect ratio media file)
   * **Playback Controls:** Ensure the video player supports play, pause, and seek.
   * **Playback Rate Control:** Allow users to control playback speed (0.5x, 1x, 1.5x, 2x).
   * **Volume Control:** Provide volume control options.
2. **Cropper Layer:**
   * **Overlay:** Overlay a cropper layer on top of the video player.
   * **Aspect Ratios:** Support multiple aspect ratios: 9:18, 9:16, 4:3, 3:4, 1:1, 4:5.
   * **Movable and Resizable:** The cropper should be movable and resizable within the video player. It should occupy 100% of the video player's height.
   * **Constraints:** Ensure the cropper stays within the video player's dimensions.
3. **Dynamic Preview:**
   * **Real-Time Update:** Display a dynamic preview of the cropped segment in a designated area on the right.
   * **Aspect Ratio Matching:** The preview must match the cropper's aspect ratio and be within a fixed height and width container. The parent container's (Modal) height should not change with the cropper’s aspect ratio.
   * **Synchronisation:** Ensure real-time updates with negligible delay between the video player and the preview.
4. **UI and Functionality:**
   * **Design Specifications:** Match the UI to the provided Figma design pixel-to-pixel.
   * **Coordinates Recording:** Record the cropper's coordinates, time elapsed, volume, and playback rate at multiple points in time.
      * **Example JSON:**

```json
[
  {
    "timeStamp": 0,
    "coordinates": [0, 0, 31.640625, 100],
    "volume": 0.5,
    "playbackRate": 1.0
  },
  {
    "timeStamp": 5,
    "coordinates": [10, 10, 41.640625, 110],
    "volume": 0.5,
    "playbackRate": 1.0
  }
]

```

   * **Download JSON:** CTA to download this JSON data on clicking "Generate Preview".
   * **Negligible Delay:** Ensure no or negligible delay between the preview and the actual video for a seamless experience.
Bonus for:
* **Recorded Session Preview:** Include a separate tab to preview a recorded session using the json coordinates, replicating the cropper's positions, volume, and playback rate.

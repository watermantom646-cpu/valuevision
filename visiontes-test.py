from google.cloud import vision

def detect_labels(image_path: str):
    client = vision.ImageAnnotatorClient()

    with open(image_path, "rb") as f:
        content = f.read()

    image = vision.Image(content=content)
    response = client.label_detection(image=image)

    if response.error.message:
        raise RuntimeError(response.error.message)

    labels = response.label_annotations
    if not labels:
        print("No labels detected.")
        return

    for label in labels[:10]:
        print(f"{label.description} ({label.score:.2f})")


if __name__ == "__main__":
    detect_labels("test.jpg")

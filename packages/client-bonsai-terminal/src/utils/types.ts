export interface Payload {
  action: string;
  data: { [key: string]: string };
  imageUrl?: string;
}
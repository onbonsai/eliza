import { refreshMetadata, refreshMetadataStatus } from "@lens-protocol/client/actions";
import { postId, type UUID } from "@lens-protocol/client";
import { client } from "./client";

export const refreshMetadataFor = async (_postId: string): Promise<string | undefined> => {
  const result = await refreshMetadata(client, {
    entity: {
      post: postId(_postId)
    }
  });
  if (result.isOk()) {
    return result.value.id;
  }
}

export const refreshMetadataStatusFor = async (id: string): Promise<string | undefined> => {
  const result = await refreshMetadataStatus(client, {
    id: id as UUID
  });
  if (result.isOk()) {
    return result.value.status;
  }
}
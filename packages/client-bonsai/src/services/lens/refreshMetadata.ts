import { request, gql } from "graphql-request";

const LENS_API_URL = "https://api.staging.lens.dev";

const REFRESH_METADATA = gql`
  mutation($request: EntityId!) {
    refreshMetadata(request: $request) {
      id
    }
  }
`;

const REFRESH_METADATA_STATUS = gql`
  mutation($id: UUID!) {
    refreshMetadataStatus(id: $id) {
      id
      status
    }
  }
`;

const query = async (query, variables) => {
  return await request(LENS_API_URL, query, variables);
};

export const refreshMetadata = async (postId: string): Promise<string | undefined> => {
  const res = (await query(REFRESH_METADATA, { request: { post: { postId } } })) as { data?: any };
  return res?.data?.refreshMetadata?.id;
}

export const refreshMetadataStatus = async (id: string): Promise<string | undefined> => {
  const res = (await query(REFRESH_METADATA_STATUS, { id })) as { data?: any };
  return res?.data?.refreshMetadataStatus?.status;
}
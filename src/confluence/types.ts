export type ConfluenceLinks = {
  base?: string;
  context?: string;
  next?: string;
  self?: string;
  tinyui?: string;
  webui?: string;
};

export type ConfluenceSpace = {
  id?: string | number;
  key?: string;
  name?: string;
};

export type ConfluenceSpaceSummary = {
  id?: string | number;
  key?: string;
  name?: string;
  type?: string;
  status?: string;
  _links?: ConfluenceLinks;
};

export type ConfluenceSpacesResponse = {
  results?: ConfluenceSpaceSummary[];
  _links?: ConfluenceLinks;
};

export type ConfluenceSpaceResponse = {
  id?: string | number;
  key?: string;
  name?: string;
  type?: string;
  status?: string;
  _links?: ConfluenceLinks;
};

export type ConfluenceSearchResult = {
  id?: string | number;
  title?: string;
  excerpt?: string;
  url?: string;
  score?: number;
  space?: ConfluenceSpace;
  resultGlobalContainer?: {
    title?: string;
    displayUrl?: string;
  };
  content?: {
    id?: string | number;
    title?: string;
    type?: string;
    space?: ConfluenceSpace;
    _links?: ConfluenceLinks;
  };
  _links?: ConfluenceLinks;
};

export type ConfluenceSearchResponse = {
  results: ConfluenceSearchResult[];
  _links?: ConfluenceLinks;
};

export type ConfluencePageResponse = {
  id: string | number;
  title: string;
  status?: string;
  spaceId?: string | number;
  body?: Record<string, unknown>;
  version?: {
    number?: number;
    createdAt?: string;
  };
  _links?: ConfluenceLinks;
};

export type ConfluencePageSummary = {
  id?: string | number;
  title?: string;
  status?: string;
  spaceId?: string | number;
  _links?: ConfluenceLinks;
  version?: {
    number?: number;
    createdAt?: string;
  };
};

export type ConfluenceSpacePagesResponse = {
  results?: ConfluencePageSummary[];
  _links?: ConfluenceLinks;
};

export type ConfluenceAncestorPage = {
  id?: string | number;
  title?: string;
  spaceId?: string | number;
  _links?: ConfluenceLinks;
};

export type ConfluencePageAncestorsResponse = {
  results?: ConfluenceAncestorPage[];
  _links?: ConfluenceLinks;
};

export type ConfluencePageDescendant = {
  id?: string | number;
  status?: string;
  title?: string;
  type?: string;
  parentId?: string | number;
  depth?: number;
  childPosition?: number;
};

export type ConfluencePageDescendantsResponse = {
  results?: ConfluencePageDescendant[];
  _links?: ConfluenceLinks;
};

export type ConfluenceRestrictionSubject = {
  accountId?: string;
  id?: string | number;
  username?: string;
  name?: string;
  displayName?: string;
};

export type ConfluenceRestrictionBucket = {
  results?: ConfluenceRestrictionSubject[];
};

export type ConfluenceRestrictionOperation = {
  operation?: string;
  restrictions?: {
    user?: ConfluenceRestrictionBucket;
    group?: ConfluenceRestrictionBucket;
  };
  user?: ConfluenceRestrictionBucket;
  group?: ConfluenceRestrictionBucket;
};

export type ConfluenceContentRestrictionsResponse = {
  results?: ConfluenceRestrictionOperation[];
  _links?: ConfluenceLinks;
} & Record<string, unknown>;

export type ConfluenceAttachmentVersion = {
  createdAt?: string;
  message?: string;
  number?: number;
  minorEdit?: boolean;
  authorId?: string;
};

export type ConfluenceAttachment = {
  id?: string | number;
  status?: string;
  title?: string;
  createdAt?: string;
  pageId?: string | number;
  blogPostId?: string | number;
  customContentId?: string | number;
  mediaType?: string;
  mediaTypeDescription?: string;
  comment?: string;
  fileId?: string;
  fileSize?: number;
  webuiLink?: string;
  downloadLink?: string;
  version?: ConfluenceAttachmentVersion;
  _links?: {
    webui?: string;
    download?: string;
  } & ConfluenceLinks;
};

export type ConfluencePageAttachmentsResponse = {
  results?: ConfluenceAttachment[];
  _links?: ConfluenceLinks;
};

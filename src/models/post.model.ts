import mongoose, { Document, Schema } from "mongoose";
import { PostStatus } from "./enums.js";

export type PostContentBlockType = "paragraph" | "heading" | "image" | "video" | "quote" | "embed";

export interface IPostContentBlock {
  type: PostContentBlockType;
  content?: string;
  url?: string;
  alt?: string;
  caption?: string;
  title?: string;
  level?: number;
}

export interface IPost {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  contentBlocks: IPostContentBlock[];
  coverImageUrl?: string;
  galleryImages: string[];
  videoUrls: string[];
  status: PostStatus;
  publishedAt?: Date;
  author: mongoose.Types.ObjectId;
  tags: string[];
  category?: string;
  seoTitle?: string;
  seoDescription?: string;
  canonicalUrl?: string;
  ogImageUrl?: string;
  noIndex: boolean;
  readingTime: number;
  relatedTournament?: mongoose.Types.ObjectId;
  relatedEvent?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPostDocument extends IPost, Document {
  readonly isPublished: boolean;
}

const postContentBlockSchema = new Schema<IPostContentBlock>(
  {
    type: {
      type: String,
      enum: ["paragraph", "heading", "image", "video", "quote", "embed"],
      required: true,
    },
    content: {
      type: String,
      trim: true,
    },
    url: {
      type: String,
      trim: true,
    },
    alt: {
      type: String,
      trim: true,
    },
    caption: {
      type: String,
      trim: true,
    },
    title: {
      type: String,
      trim: true,
    },
    level: {
      type: Number,
      min: 1,
      max: 6,
    },
  },
  { _id: false },
);

const postSchema = new Schema<IPostDocument>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 220,
    },
    excerpt: {
      type: String,
      required: true,
      trim: true,
      maxlength: 320,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    contentBlocks: {
      type: [postContentBlockSchema],
      default: [],
    },
    coverImageUrl: {
      type: String,
      trim: true,
    },
    galleryImages: {
      type: [String],
      default: [],
    },
    videoUrls: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: Object.values(PostStatus),
      default: PostStatus.DRAFT,
    },
    publishedAt: Date,
    author: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    category: {
      type: String,
      trim: true,
      maxlength: 80,
    },
    seoTitle: {
      type: String,
      trim: true,
      maxlength: 180,
    },
    seoDescription: {
      type: String,
      trim: true,
      maxlength: 320,
    },
    canonicalUrl: {
      type: String,
      trim: true,
    },
    ogImageUrl: {
      type: String,
      trim: true,
    },
    noIndex: {
      type: Boolean,
      default: false,
    },
    readingTime: {
      type: Number,
      required: true,
      min: 1,
    },
    relatedTournament: {
      type: Schema.Types.ObjectId,
      ref: "Tournament",
    },
    relatedEvent: {
      type: Schema.Types.ObjectId,
      ref: "Event",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

postSchema.index({ slug: 1 }, { unique: true });
postSchema.index({ status: 1, publishedAt: -1 });
postSchema.index({ category: 1, status: 1, publishedAt: -1 });
postSchema.index({ tags: 1, status: 1, publishedAt: -1 });
postSchema.index({ title: "text", excerpt: "text", content: "text" });

postSchema.virtual("isPublished").get(function (this: IPostDocument) {
  return this.status === PostStatus.PUBLISHED;
});

const Post = mongoose.model<IPostDocument>("Post", postSchema);

export default Post;
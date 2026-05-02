const mongoose = require("mongoose");
const { buildSchemaOptions } = require("./common");

const activityFieldChangeSchema = new mongoose.Schema(
  {
    field: {
      type: String,
      required: true,
      trim: true,
    },
    from: {
      type: String,
      default: null,
    },
    to: {
      type: String,
      default: null,
    },
  },
  buildSchemaOptions(false)
);

const activityLogSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
      index: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        "TASK_CREATED",
        "TASK_UPDATED",
        "TASK_STATUS_CHANGED",
        "TASK_ATTACHMENT_ADDED",
        "TASK_ATTACHMENT_REMOVED",
      ],
      index: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    fieldChanges: {
      type: [activityFieldChangeSchema],
      default: [],
    },
  },
  buildSchemaOptions(true)
);

activityLogSchema.virtual("actor", {
  ref: "User",
  localField: "actorId",
  foreignField: "_id",
  justOne: true,
});

module.exports = mongoose.model("ActivityLog", activityLogSchema);

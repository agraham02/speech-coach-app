import ExpoModulesCore
import NaturalLanguage

// Apple's built-in English embeddings (NLEmbedding): a vector for a word or a
// sentence, so the app can tell how close two of them are in meaning, on the
// phone, offline, with nothing to download. Used for the phone's content checks
// (docs/overhaul/PLAN.md, section 6.6): "table" isn't an animal, and a fluent
// answer to a different question isn't on topic. The maths on the vectors is in
// JS (src/services/language/embeddings.ts), so this stays as small as it can.
public class TonoLanguageModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TonoLanguage")

    // Whether this phone has the embedding: "word" or "sentence".
    AsyncFunction("isAvailable") { (kind: String) -> Bool in
      return TonoLanguageModule.embedding(kind) != nil
    }

    // The vector for a word or sentence. Empty when the embedding doesn't know
    // it (or isn't there), which the caller treats as "can't check".
    AsyncFunction("vector") { (kind: String, text: String) -> [Double] in
      guard let embedding = TonoLanguageModule.embedding(kind) else { return [] }
      return embedding.vector(for: text) ?? []
    }
  }

  private static func embedding(_ kind: String) -> NLEmbedding? {
    switch kind {
    case "word":
      return NLEmbedding.wordEmbedding(for: .english)
    case "sentence":
      return NLEmbedding.sentenceEmbedding(for: .english)
    default:
      return nil
    }
  }
}
